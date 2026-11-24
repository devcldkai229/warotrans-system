using System.Collections.Concurrent;
using WaroTrans.BuildingBlocks.Maps;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// Whether a robot standing at a queue point still leaves its goal open, decided on the map itself (no fixed list of
/// "good" queue points): the bundle's occupancy (what Nav2 plans on) as a costmap where a robot centre may go
/// (cost below inscribed), plus the standing robot's body inflated by the inscribed radius. The goal must still reach
/// (flood fill) about as much of the map as without the robot there; a queue point that seals the goal into a pocket
/// (a dead-end bay too narrow to pass the waiting robot) is refused.
/// </summary>
public static class QueuePassability
{
    /// <summary>Share of the goal's open area that must stay reachable with the waiting robot in place.</summary>
    public const double KeepShare = 0.8;

    private sealed record Grid(int Width, int Height, double Resolution, double OriginX, double OriginY, bool[] Open);

    private static readonly ConcurrentDictionary<string, Grid?> Grids = new();

    /// <summary>
    /// True when a robot (rectangle halfLength x halfWidth at <paramref name="queueYaw"/>) standing at the queue point
    /// leaves the goal connected to the map; also true when the map cannot be read (no veto without evidence).
    /// </summary>
    public static bool KeepsGoalOpen(string? bundleDirectory, double goalX, double goalY, double queueX, double queueY,
        double queueYaw, double halfLength, double halfWidth, double inscribedRadius = StaticCostmap.DefaultInscribed)
    {
        if (string.IsNullOrWhiteSpace(bundleDirectory) || Load(bundleDirectory) is not { } g)
        {
            return true;
        }

        var start = Cell(g, goalX, goalY);
        if (start < 0 || !g.Open[start])
        {
            return true;
        }

        var without = Reach(g, start, null);
        var body = BodyCells(g, queueX, queueY, queueYaw, halfLength + inscribedRadius, halfWidth + inscribedRadius);
        if (body.Contains(start))
        {
            return false;
        }

        var with = Reach(g, start, body);
        return with >= KeepShare * without;
    }

    private static Grid? Load(string dir) => Grids.GetOrAdd(dir, d =>
    {
        var yaml = Path.Combine(d, "map.yaml");
        var pgmPath = Path.Combine(d, "map.pgm");
        if (!File.Exists(yaml) || !File.Exists(pgmPath) || StaticCostmap.ReadPgm(File.ReadAllBytes(pgmPath)) is not { } pgm)
        {
            return null;
        }

        double resolution = 0;
        double ox = 0, oy = 0;
        var lines = File.ReadAllLines(yaml);
        for (var i = 0; i < lines.Length; i++)
        {
            var t = lines[i].Trim();
            if (t.StartsWith("resolution:", StringComparison.Ordinal))
            {
                resolution = double.Parse(t[11..].Trim(), System.Globalization.CultureInfo.InvariantCulture);
            }
            else if (t.StartsWith("origin:", StringComparison.Ordinal))
            {
                var rest = t[7..].Trim();
                var nums = rest.StartsWith('[')
                    ? rest.Trim('[', ']').Split(',').Select(s => s.Trim()).ToArray()
                    : lines.Skip(i + 1).Take(2).Select(l => l.Trim().TrimStart('-').Trim()).ToArray();
                ox = double.Parse(nums[0], System.Globalization.CultureInfo.InvariantCulture);
                oy = double.Parse(nums[1], System.Globalization.CultureInfo.InvariantCulture);
            }
        }

        if (resolution <= 0)
        {
            return null;
        }

        var (occupied, _) = StaticCostmap.Classify(pgm.Pixels);
        var costs = StaticCostmap.Compute(occupied, pgm.Width, pgm.Height, resolution, StaticCostmap.DefaultInscribed,
            StaticCostmap.DefaultInflationRadius, StaticCostmap.DefaultCostScaling);
        // costs rows are bottom-up; keep that order (row 0 = lowest y), like Cell() below.
        var open = costs.Select(c => c < StaticCostmap.BlockedFrom).ToArray();
        return new Grid(pgm.Width, pgm.Height, resolution, ox, oy, open);
    });

    private static int Cell(Grid g, double x, double y)
    {
        var col = (int)Math.Floor((x - g.OriginX) / g.Resolution);
        var row = (int)Math.Floor((y - g.OriginY) / g.Resolution);
        return col < 0 || row < 0 || col >= g.Width || row >= g.Height ? -1 : row * g.Width + col;
    }

    private static HashSet<int> BodyCells(Grid g, double x, double y, double yaw, double halfLength, double halfWidth)
    {
        var cells = new HashSet<int>();
        var reach = Math.Sqrt(halfLength * halfLength + halfWidth * halfWidth);
        var (c, s) = (Math.Cos(yaw), Math.Sin(yaw));
        for (var py = y - reach; py <= y + reach; py += g.Resolution / 2)
        {
            for (var px = x - reach; px <= x + reach; px += g.Resolution / 2)
            {
                var (dx, dy) = (px - x, py - y);
                var along = dx * c + dy * s;
                var across = -dx * s + dy * c;
                if (Math.Abs(along) <= halfLength && Math.Abs(across) <= halfWidth && Cell(g, px, py) is var i && i >= 0)
                {
                    cells.Add(i);
                }
            }
        }

        return cells;
    }

    private static int Reach(Grid g, int start, HashSet<int>? blocked)
    {
        var seen = new bool[g.Open.Length];
        var queue = new Queue<int>();
        queue.Enqueue(start);
        seen[start] = true;
        var count = 0;
        while (queue.Count > 0)
        {
            var i = queue.Dequeue();
            count++;
            var (r, col) = (i / g.Width, i % g.Width);
            foreach (var (nr, nc) in new[] { (r + 1, col), (r - 1, col), (r, col + 1), (r, col - 1) })
            {
                if (nr < 0 || nc < 0 || nr >= g.Height || nc >= g.Width)
                {
                    continue;
                }

                var n = nr * g.Width + nc;
                if (!seen[n] && g.Open[n] && (blocked is null || !blocked.Contains(n)))
                {
                    seen[n] = true;
                    queue.Enqueue(n);
                }
            }
        }

        return count;
    }
}
