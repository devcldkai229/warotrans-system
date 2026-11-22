using System.Collections.Concurrent;
using System.Globalization;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Free floor of a semantic map bundle (map.pgm, minus keepout_planning.pgm when present) as the distance from every
/// grid cell to the nearest cell a robot cannot stand on. Read once per directory and file time.
/// </summary>
public sealed class FreeFloorGrid
{
    private static readonly ConcurrentDictionary<string, (DateTime Stamp, FreeFloorGrid? Grid)> Cache = new(StringComparer.OrdinalIgnoreCase);

    private readonly double[] _clearance;

    private FreeFloorGrid(double resolution, double originX, double originY, int width, int height, double[] clearance)
    {
        Resolution = resolution;
        OriginX = originX;
        OriginY = originY;
        Width = width;
        Height = height;
        _clearance = clearance;
    }

    public double Resolution { get; }
    public double OriginX { get; }
    public double OriginY { get; }
    public int Width { get; }
    public int Height { get; }

    /// <summary>Metres from (x, y) to the nearest blocked or unknown cell; 0 off the map or on a blocked cell.</summary>
    public double ClearanceAt(double x, double y)
    {
        var cx = (int)Math.Floor((x - OriginX) / Resolution);
        var row = Height - 1 - (int)Math.Floor((y - OriginY) / Resolution);
        return cx < 0 || cx >= Width || row < 0 || row >= Height ? 0 : _clearance[row * Width + cx];
    }

    public static FreeFloorGrid? TryLoad(string mapDir)
    {
        var yaml = Path.Combine(mapDir, "map.yaml");
        if (!File.Exists(yaml))
        {
            return null;
        }

        var stamp = File.GetLastWriteTimeUtc(yaml);
        if (Cache.TryGetValue(mapDir, out var hit) && hit.Stamp == stamp)
        {
            return hit.Grid;
        }

        FreeFloorGrid? grid;
        try
        {
            grid = Load(mapDir);
        }
        catch (Exception ex) when (ex is IOException or FormatException or InvalidDataException or IndexOutOfRangeException)
        {
            grid = null;
        }

        Cache[mapDir] = (stamp, grid);
        return grid;
    }

    private static FreeFloorGrid? Load(string mapDir)
    {
        var (image, resolution, ox, oy) = ReadYaml(Path.Combine(mapDir, "map.yaml"));
        var (w, h, pixels) = ReadPgm(Path.Combine(mapDir, image));
        var free = new bool[w * h];
        for (var i = 0; i < free.Length; i++)
        {
            free[i] = pixels[i] >= 250; // trinary: 254 free, 205 unknown, 0 occupied
        }

        var keepYaml = Path.Combine(mapDir, "keepout_planning.yaml");
        if (File.Exists(keepYaml))
        {
            var (kImage, kRes, kx, ky) = ReadYaml(keepYaml);
            var (kw, kh, keep) = ReadPgm(Path.Combine(mapDir, kImage));
            if (kw == w && kh == h && Math.Abs(kRes - resolution) < 1e-9 && Math.Abs(kx - ox) < 1e-6 && Math.Abs(ky - oy) < 1e-6)
            {
                for (var i = 0; i < free.Length; i++)
                {
                    free[i] &= keep[i] >= 250;
                }
            }
        }

        // Two-pass chamfer distance (in cells) to the nearest blocked cell, then metres.
        const double Straight = 1.0;
        var diagonal = Math.Sqrt(2.0);
        var d = new double[w * h];
        for (var i = 0; i < d.Length; i++)
        {
            d[i] = free[i] ? double.PositiveInfinity : 0;
        }

        for (var r = 0; r < h; r++)
        {
            for (var c = 0; c < w; c++)
            {
                var i = r * w + c;
                if (c > 0) d[i] = Math.Min(d[i], d[i - 1] + Straight);
                if (r > 0) d[i] = Math.Min(d[i], d[i - w] + Straight);
                if (r > 0 && c > 0) d[i] = Math.Min(d[i], d[i - w - 1] + diagonal);
                if (r > 0 && c < w - 1) d[i] = Math.Min(d[i], d[i - w + 1] + diagonal);
            }
        }

        for (var r = h - 1; r >= 0; r--)
        {
            for (var c = w - 1; c >= 0; c--)
            {
                var i = r * w + c;
                if (c < w - 1) d[i] = Math.Min(d[i], d[i + 1] + Straight);
                if (r < h - 1) d[i] = Math.Min(d[i], d[i + w] + Straight);
                if (r < h - 1 && c < w - 1) d[i] = Math.Min(d[i], d[i + w + 1] + diagonal);
                if (r < h - 1 && c > 0) d[i] = Math.Min(d[i], d[i + w - 1] + diagonal);
            }
        }

        // Cell centre to the nearest blocked cell's edge: (cells - 0.5) * resolution; off-map counts as blocked.
        var clearance = new double[w * h];
        for (var r = 0; r < h; r++)
        {
            for (var c = 0; c < w; c++)
            {
                var edge = Math.Min(Math.Min(c, w - 1 - c), Math.Min(r, h - 1 - r)) + 0.5;
                var i = r * w + c;
                clearance[i] = d[i] == 0 ? 0 : Math.Min(d[i] - 0.5, edge) * resolution;
            }
        }

        return new FreeFloorGrid(resolution, ox, oy, w, h, clearance);
    }

    private static (string Image, double Resolution, double OriginX, double OriginY) ReadYaml(string path)
    {
        var lines = File.ReadAllLines(path);
        string image = "map.pgm";
        double resolution = 0.05, ox = 0, oy = 0;
        for (var i = 0; i < lines.Length; i++)
        {
            var line = lines[i].Trim();
            if (line.StartsWith("image:", StringComparison.Ordinal))
            {
                image = line["image:".Length..].Trim().Trim('"', '\'');
            }
            else if (line.StartsWith("resolution:", StringComparison.Ordinal))
            {
                resolution = double.Parse(line["resolution:".Length..].Trim(), CultureInfo.InvariantCulture);
            }
            else if (line.StartsWith("origin:", StringComparison.Ordinal))
            {
                var rest = line["origin:".Length..].Trim();
                double[] values;
                if (rest.StartsWith('['))
                {
                    values = rest.Trim('[', ']').Split(',').Select(v => double.Parse(v.Trim(), CultureInfo.InvariantCulture)).ToArray();
                }
                else
                {
                    // Block list: "- -1.642" (list marker, then the value).
                    values = lines.Skip(i + 1).Take(2)
                        .Select(v =>
                        {
                            var t = v.Trim();
                            return double.Parse(t.StartsWith('-') ? t[1..].Trim() : t, CultureInfo.InvariantCulture);
                        })
                        .ToArray();
                }

                ox = values[0];
                oy = values[1];
            }
        }

        return (Path.GetFileName(image), resolution, ox, oy);
    }

    private static (int Width, int Height, byte[] Pixels) ReadPgm(string path)
    {
        var data = File.ReadAllBytes(path);
        var tokens = new List<string>();
        var i = 0;
        while (tokens.Count < 4)
        {
            while (char.IsWhiteSpace((char)data[i])) i++;
            if (data[i] == '#')
            {
                while (data[i] != '\n') i++;
                continue;
            }

            var start = i;
            while (!char.IsWhiteSpace((char)data[i])) i++;
            tokens.Add(System.Text.Encoding.ASCII.GetString(data, start, i - start));
        }

        if (tokens[0] != "P5")
        {
            throw new InvalidDataException($"expected a binary P5 PGM, got {tokens[0]}");
        }

        var w = int.Parse(tokens[1], CultureInfo.InvariantCulture);
        var h = int.Parse(tokens[2], CultureInfo.InvariantCulture);
        i++; // the single whitespace after maxval
        var pixels = new byte[w * h];
        Array.Copy(data, i, pixels, 0, w * h);
        return (w, h, pixels);
    }
}

/// <summary>
/// Where a robot that has to give way can step aside close by, instead of driving to an endpoint across the floor: the
/// nearest free spot (within <c>maxRadius</c>) where its body, at the heading it drives in with, takes none of the
/// cells and zones the other robot still needs, that is clear of walls, keepout, no-stop and single-occupancy zones,
/// and that it reaches in a straight line over free floor without passing another robot.
/// </summary>
public static class YieldSpots
{
    public static (double X, double Y, double Yaw)? Find(
        SemanticTrafficPolicy policy,
        FreeFloorGrid grid,
        double robotX,
        double robotY,
        IReadOnlySet<string> avoid,
        IReadOnlyList<(double X, double Y)> otherRobots,
        double margin,
        double minRadius = 0.30,
        double maxRadius = 1.2,
        double step = 0.05)
    {
        var standClearance = policy.FootprintRadiusMeters + 0.03; // it may turn there before driving on
        var driveClearance = policy.FootprintHalfWidth + 0.03;
        var zoneRadius = Math.Max(policy.FootprintHalfLength, policy.FootprintHalfWidth);
        var zones = policy.SingleOccupancyZones.IsDefaultOrEmpty ? [] : policy.SingleOccupancyZones;
        var noStop = policy.NoStopZones.IsDefaultOrEmpty ? [] : policy.NoStopZones;
        var keepout = policy.KeepoutZones.IsDefaultOrEmpty ? [] : policy.KeepoutZones;
        (double X, double Y, double Yaw)? best = null;
        var bestScore = double.PositiveInfinity;
        var n = (int)Math.Ceiling(maxRadius / step);
        for (var ix = -n; ix <= n; ix++)
        {
            for (var iy = -n; iy <= n; iy++)
            {
                var dx = ix * step;
                var dy = iy * step;
                var d = Math.Sqrt(dx * dx + dy * dy);
                if (d < minRadius || d > maxRadius || d >= bestScore)
                {
                    continue;
                }

                var x = robotX + dx;
                var y = robotY + dy;
                if (grid.ClearanceAt(x, y) < standClearance
                    || zones.Any(z => SemanticReservation.DiscHitsZone(x, y, zoneRadius, z.Ring))
                    || noStop.Any(z => SemanticReservation.DiscHitsZone(x, y, zoneRadius, z.Ring))
                    || keepout.Any(z => SemanticReservation.DiscHitsZone(x, y, standClearance, z.Ring))
                    || otherRobots.Any(o => Math.Sqrt(Math.Pow(o.X - x, 2) + Math.Pow(o.Y - y, 2)) < 2 * policy.FootprintRadiusMeters + 0.1))
                {
                    continue;
                }

                var yaw = Math.Atan2(dy, dx);
                var body = new HashSet<string>(StringComparer.Ordinal);
                SemanticReservation.StandingCells(policy, x, y, yaw, margin, body);
                if (body.Overlaps(avoid) || !Reachable(grid, robotX, robotY, x, y, driveClearance, otherRobots, policy))
                {
                    continue;
                }

                best = (x, y, yaw);
                bestScore = d;
            }
        }

        return best;
    }

    private static bool Reachable(
        FreeFloorGrid grid, double ax, double ay, double bx, double by, double clearance,
        IReadOnlyList<(double X, double Y)> otherRobots, SemanticTrafficPolicy policy)
    {
        var length = Math.Sqrt(Math.Pow(bx - ax, 2) + Math.Pow(by - ay, 2));
        var samples = Math.Max(1, (int)Math.Ceiling(length / 0.025));
        for (var k = 1; k <= samples; k++)
        {
            var t = (double)k / samples;
            // The robot already stands at the start: a spot close to a wall (MAP-ONE Queue B, 3 cm from it) must not
            // forbid every way out. Clearance counts from 0.25 m on.
            if (t * length < 0.25)
            {
                continue;
            }

            if (grid.ClearanceAt(ax + (bx - ax) * t, ay + (by - ay) * t) < clearance)
            {
                return false;
            }
        }

        var pass = 2 * policy.FootprintRadiusMeters + 0.05;
        return otherRobots.All(o => SemanticReservation.PointToSegmentDistance(o.X, o.Y, ax, ay, bx, by) >= pass);
    }
}
