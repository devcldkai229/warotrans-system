using System.Collections.Concurrent;
using System.Text.Json;
using WaroTrans.BuildingBlocks.Maps;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// CHECK ROUTE_CLEAR: what driving to an endpoint costs, and what is in the way, judged on the robot's own live Nav2
/// costmap (sent every few seconds, <c>LiveCostmapStore</c>) against the map's static costmap (the bundle the robots
/// plan on). The robot centre may not enter a cell of cost 99 (inscribed) or more; every other cell costs its distance
/// times (1 + cost / 50), so a way through narrow places costs more than an open one.
/// </summary>
public static class RouteCostEvaluator
{
    /// <summary>Nav2 occupancy scale: 99 = inscribed (the robot body touches an obstacle), 100 = lethal, 255 unknown.</summary>
    public const byte Inscribed = 99;

    /// <summary>A cell at least this costly is a narrow place (the robot passes within ~0.2 m of something).</summary>
    public const byte NarrowCost = 50;

    /// <summary>A way around costing more than this times the open way is a detour worth reporting.</summary>
    public const double DetourFactor = 1.5;

    public sealed record CostGrid(int Width, int Height, double Resolution, double OriginX, double OriginY, byte[] Cost)
    {
        public (int C, int R) Cell(double x, double y) =>
            ((int)Math.Floor((x - OriginX) / Resolution), (int)Math.Floor((y - OriginY) / Resolution));

        public bool Inside(int c, int r) => c >= 0 && r >= 0 && c < Width && r < Height;

        public byte At(int c, int r) => Cost[r * Width + c];

        public (double X, double Y) Center(int c, int r) => (OriginX + (c + 0.5) * Resolution, OriginY + (r + 0.5) * Resolution);
    }

    public sealed record Route(bool Found, double LengthMeters, double CostedLength, int NarrowCells, byte MaxCost,
        IReadOnlyList<(int C, int R)> Cells);

    public enum Verdict
    {
        /// <summary>The way is open (it may still be narrow).</summary>
        Pass,

        /// <summary>Something new is on the usual way, but there is a way around it (Nav2 will take it).</summary>
        Reroute,

        /// <summary>The way is shut by another robot: wait for it (queue point / traffic), it will move.</summary>
        BlockedByRobot,

        /// <summary>The way is shut by something that is not a robot: it will not move by itself.</summary>
        BlockedByObstacle,

        /// <summary>No way even on the map itself (endpoint inside an obstacle, wrong map).</summary>
        NoRoute
    }

    public sealed record Analysis(
        Verdict Verdict,
        double LengthMeters,
        double EstimatedSeconds,
        int NarrowCells,
        bool LiveCostmap,
        Guid? BlockingRobot,
        string Reason);

    /// <summary>The live costmap message (costmap_uplink.build_message) as a grid; null when it cannot be read.</summary>
    public static CostGrid? FromLiveCostmap(JsonElement body)
    {
        try
        {
            var w = body.GetProperty("width").GetInt32();
            var h = body.GetProperty("height").GetInt32();
            var data = Convert.FromBase64String(body.GetProperty("data").GetString() ?? "");
            if (w <= 0 || h <= 0 || data.Length != w * h)
            {
                return null;
            }

            return new CostGrid(w, h, body.GetProperty("resolution").GetDouble(), body.GetProperty("originX").GetDouble(),
                body.GetProperty("originY").GetDouble(), data);
        }
        catch (Exception ex) when (ex is KeyNotFoundException or FormatException or InvalidOperationException)
        {
            return null;
        }
    }

    private static readonly ConcurrentDictionary<string, CostGrid?> StaticGrids = new(StringComparer.Ordinal);

    /// <summary>The static costmap of a bundle (map.pgm / map.yaml), Nav2's formula; cached per directory.</summary>
    public static CostGrid? FromBundle(string bundleDirectory, double inscribedRadius = StaticCostmap.DefaultInscribed,
        double inflationRadius = 0.35, double costScalingFactor = 4.0) =>
        StaticGrids.GetOrAdd(bundleDirectory, dir =>
        {
            try
            {
                var yaml = File.ReadAllText(Path.Combine(dir, "map.yaml"));
                var res = double.Parse(System.Text.RegularExpressions.Regex.Match(yaml, @"resolution:\s*([\d.]+)").Groups[1].Value,
                    System.Globalization.CultureInfo.InvariantCulture);
                var origin = System.Text.RegularExpressions.Regex.Match(yaml, @"origin:\s*\[([^\]]+)\]").Groups[1].Value.Split(',')
                    .Select(v => double.Parse(v.Trim(), System.Globalization.CultureInfo.InvariantCulture)).ToArray();
                if (StaticCostmap.ReadPgm(File.ReadAllBytes(Path.Combine(dir, "map.pgm"))) is not { } pgm)
                {
                    return null;
                }

                // PGM rows top-down in; OccupancyGrid values 0..100, rows bottom-up out (as the live costmap).
                var (occupied, _) = StaticCostmap.Classify(pgm.Pixels);
                var occupancy = StaticCostmap.Compute(occupied, pgm.Width, pgm.Height, res, inscribedRadius, inflationRadius, costScalingFactor);
                return new CostGrid(pgm.Width, pgm.Height, res, origin[0], origin[1], occupancy);
            }
            catch (Exception ex) when (ex is IOException or FormatException or IndexOutOfRangeException)
            {
                return null;
            }
        });

    /// <summary>Cheapest way for the robot centre from start to goal (8-connected A*).</summary>
    public static Route Plan(CostGrid grid, double sx, double sy, double gx, double gy)
    {
        var (sc, sr) = grid.Cell(sx, sy);
        var (gc, gr) = grid.Cell(gx, gy);
        if (!grid.Inside(sc, sr) || !grid.Inside(gc, gr))
        {
            return new Route(false, 0, 0, 0, 0, []);
        }

        // The start and goal cells may sit in the inflated band (a robot docked at a shelf): they are allowed.
        bool Free(int c, int r) => (c == sc && r == sr) || (c == gc && r == gr) || grid.At(c, r) < Inscribed;
        var n = grid.Width * grid.Height;
        var g = new double[n];
        Array.Fill(g, double.PositiveInfinity);
        var from = new int[n];
        Array.Fill(from, -1);
        var open = new PriorityQueue<int, double>();
        var start = sr * grid.Width + sc;
        var goal = gr * grid.Width + gc;
        g[start] = 0;
        open.Enqueue(start, 0);
        ReadOnlySpan<(int Dc, int Dr, double Len)> steps =
            [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.41421356), (1, -1, 1.41421356), (-1, 1, 1.41421356), (-1, -1, 1.41421356)];
        while (open.TryDequeue(out var cur, out _))
        {
            if (cur == goal)
            {
                break;
            }

            var (c, r) = (cur % grid.Width, cur / grid.Width);
            foreach (var (dc, dr, len) in steps)
            {
                var (nc, nr) = (c + dc, r + dr);
                if (!grid.Inside(nc, nr) || !Free(nc, nr))
                {
                    continue;
                }

                var cost = grid.At(nc, nr);
                var step = len * grid.Resolution * (1 + (cost == 255 ? 0 : cost) / 50.0);
                var next = nr * grid.Width + nc;
                if (g[cur] + step < g[next])
                {
                    g[next] = g[cur] + step;
                    from[next] = cur;
                    var h = Math.Sqrt(Math.Pow(nc - gc, 2) + Math.Pow(nr - gr, 2)) * grid.Resolution;
                    open.Enqueue(next, g[next] + h);
                }
            }
        }

        if (double.IsPositiveInfinity(g[goal]))
        {
            return new Route(false, 0, 0, 0, 0, []);
        }

        var cells = new List<(int C, int R)>();
        for (var at = goal; at != -1; at = from[at])
        {
            cells.Add((at % grid.Width, at / grid.Width));
        }

        cells.Reverse();
        var length = 0.0;
        var narrow = 0;
        byte max = 0;
        for (var i = 0; i < cells.Count; i++)
        {
            if (i > 0)
            {
                length += Math.Sqrt(Math.Pow(cells[i].C - cells[i - 1].C, 2) + Math.Pow(cells[i].R - cells[i - 1].R, 2)) * grid.Resolution;
            }

            var cost = grid.At(cells[i].C, cells[i].R);
            if (cost != 255)
            {
                max = Math.Max(max, cost);
                narrow += cost >= NarrowCost ? 1 : 0;
            }
        }

        return new Route(true, length, g[goal], narrow, max, cells);
    }

    /// <summary>
    /// The verdict for driving from (sx, sy) to (gx, gy): the static map says whether there is a way at all; the live
    /// costmap (when fresh) says whether it is open now, and if not, whether a robot (one of <paramref name="robots"/>,
    /// centre and radius) or something else shuts it.
    /// </summary>
    public static Analysis Analyze(
        CostGrid staticGrid, CostGrid? live, double sx, double sy, double gx, double gy,
        IReadOnlyList<(Guid Id, double X, double Y, double Radius)> robots, double cruiseMps = 0.25)
    {
        var usual = Plan(staticGrid, sx, sy, gx, gy);
        if (!usual.Found)
        {
            return new Analysis(Verdict.NoRoute, 0, 0, 0, live is not null, null, "no way on the map itself");
        }

        double Seconds(Route r) => r.LengthMeters / Math.Max(0.05, cruiseMps) + 2.0 * Turns(r);
        if (live is null)
        {
            return new Analysis(Verdict.Pass, usual.LengthMeters, Seconds(usual), usual.NarrowCells, false, null,
                "no live costmap: judged on the map");
        }

        var now = Plan(live, sx, sy, gx, gy);
        if (now.Found)
        {
            var detour = now.CostedLength > usual.CostedLength * DetourFactor;
            return new Analysis(detour ? Verdict.Reroute : Verdict.Pass, now.LengthMeters, Seconds(now), now.NarrowCells, true, null,
                detour ? $"something new on the usual way: around it {now.LengthMeters:F2} m instead of {usual.LengthMeters:F2} m" : "open");
        }

        // Shut now: what stands on the usual way? A robot when the shut cells are around one of them.
        foreach (var (c, r) in usual.Cells)
        {
            var (lc, lr) = live.Cell(staticGrid.Center(c, r).X, staticGrid.Center(c, r).Y);
            if (!live.Inside(lc, lr) || live.At(lc, lr) < Inscribed || live.At(lc, lr) == 255)
            {
                continue;
            }

            var (x, y) = live.Center(lc, lr);
            foreach (var robot in robots)
            {
                if (Math.Sqrt(Math.Pow(x - robot.X, 2) + Math.Pow(y - robot.Y, 2)) <= robot.Radius + 0.35)
                {
                    return new Analysis(Verdict.BlockedByRobot, usual.LengthMeters, Seconds(usual), usual.NarrowCells, true, robot.Id,
                        "another robot stands on the way");
                }
            }

            return new Analysis(Verdict.BlockedByObstacle, usual.LengthMeters, Seconds(usual), usual.NarrowCells, true, null,
                FormattableString.Invariant($"an obstacle on the way near ({x:F2}, {y:F2}) and no way around it"));
        }

        return new Analysis(Verdict.BlockedByObstacle, usual.LengthMeters, Seconds(usual), usual.NarrowCells, true, null,
            "no way around on the robot's costmap");
    }

    private static int Turns(Route r)
    {
        var turns = 0;
        for (var i = 2; i < r.Cells.Count; i++)
        {
            var (a, b, c) = (r.Cells[i - 2], r.Cells[i - 1], r.Cells[i]);
            if ((b.C - a.C, b.R - a.R) != (c.C - b.C, c.R - b.R))
            {
                turns++;
            }
        }

        return Math.Min(turns, 20) / 4;
    }
}
