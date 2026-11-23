namespace WaroTrans.BuildingBlocks.Maps;

/// <summary>
/// The map's own Nav2 global costmap, as it is right after mapping: static layer (occupied cells of map.pgm = lethal)
/// + InflationLayer, optionally + the planner keep-out mask. No robot, no LiDAR, no traffic. Same formula and the same
/// costmap → OccupancyGrid translation as Nav2 (nav2_costmap_2d InflationLayer::computeCost, Costmap2DPublisher).
/// </summary>
public static class StaticCostmap
{
    public const byte Lethal = 254;
    public const byte Inscribed = 253;

    /// <summary>Nav2 global costmap parameters of the lab robots (read live 2026-11-24): the larger robot's inscribed
    /// radius (RBT-002 half-width 0.132 + padding 0.02; RBT-001 0.13), inflation_radius 0.35, cost_scaling_factor 4.0.</summary>
    public const double DefaultInscribed = 0.152;
    public const double DefaultInflationRadius = 0.35;
    public const double DefaultCostScaling = 4.0;

    /// <summary>OccupancyGrid value at or above which a robot's centre may not be: 99 inscribed, 100 lethal.</summary>
    public const byte BlockedFrom = 99;

    /// <summary>map_server trinary thresholds: occupied (lethal) above, free below free_thresh, unknown between.</summary>
    public static (bool[] Occupied, bool[] Unknown) Classify(ReadOnlySpan<byte> pgm, double occupiedThresh = 0.65,
        double freeThresh = 0.196)
    {
        var occupied = new bool[pgm.Length];
        var unknown = new bool[pgm.Length];
        for (var i = 0; i < pgm.Length; i++)
        {
            var p = (255 - pgm[i]) / 255.0;
            occupied[i] = p > occupiedThresh;
            unknown[i] = !occupied[i] && p > freeThresh;
        }

        return (occupied, unknown);
    }

    /// <summary>Binary PGM (P5, maxval ≤ 255, '#' comments): width, height and pixels (first row = top).</summary>
    public static (int Width, int Height, byte[] Pixels)? ReadPgm(byte[] bytes)
    {
        var pos = 0;
        string? Token()
        {
            while (pos < bytes.Length)
            {
                if (bytes[pos] == '#')
                {
                    while (pos < bytes.Length && bytes[pos] != 10 /* LF */)
                    {
                        pos++;
                    }
                }
                else if (char.IsWhiteSpace((char)bytes[pos]))
                {
                    pos++;
                }
                else
                {
                    break;
                }
            }

            var start = pos;
            while (pos < bytes.Length && !char.IsWhiteSpace((char)bytes[pos]))
            {
                pos++;
            }

            return pos > start ? System.Text.Encoding.ASCII.GetString(bytes, start, pos - start) : null;
        }

        if (Token() != "P5" || !int.TryParse(Token(), out var w) || !int.TryParse(Token(), out var h)
            || !int.TryParse(Token(), out var max) || max > 255)
        {
            return null;
        }

        pos++;
        return bytes.Length - pos < w * h ? null : (w, h, bytes.AsSpan(pos, w * h).ToArray());
    }

    /// <summary>OccupancyGrid value (rows bottom-up) at a map point; null outside the grid.</summary>
    public static byte? CostAt(byte[] grid, int width, int height, double resolution, double originX, double originY,
        double x, double y)
    {
        var col = (int)Math.Floor((x - originX) / resolution);
        var row = (int)Math.Floor((y - originY) / resolution);
        return col < 0 || row < 0 || col >= width || row >= height ? null : grid[row * width + col];
    }

    /// <param name="occupied">Row-major, first row = top of the image (PGM order); true = lethal.</param>
    /// <returns>OccupancyGrid values 0..100, rows bottom-up (ROS order), as a robot's /global_costmap/costmap.</returns>
    public static byte[] Compute(bool[] occupied, int width, int height, double resolution,
        double inscribedRadius, double inflationRadius, double costScalingFactor)
    {
        // Distance (metres) from each cell centre to the nearest lethal cell centre, within the inflation radius.
        var reach = (int)Math.Ceiling(inflationRadius / resolution);
        var dist = new double[width * height];
        Array.Fill(dist, double.PositiveInfinity);
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                if (!occupied[y * width + x])
                {
                    continue;
                }

                for (var dy = -reach; dy <= reach; dy++)
                {
                    var ny = y + dy;
                    if (ny < 0 || ny >= height)
                    {
                        continue;
                    }

                    for (var dx = -reach; dx <= reach; dx++)
                    {
                        var nx = x + dx;
                        if (nx < 0 || nx >= width)
                        {
                            continue;
                        }

                        var d = Math.Sqrt(dx * dx + dy * dy) * resolution;
                        var i = ny * width + nx;
                        if (d < dist[i])
                        {
                            dist[i] = d;
                        }
                    }
                }
            }
        }

        var grid = new byte[width * height];
        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var cost = Cost(dist[y * width + x], inscribedRadius, inflationRadius, costScalingFactor);
                grid[(height - 1 - y) * width + x] = ToOccupancy(cost); // bottom-up, like the robot's message
            }
        }

        return grid;
    }

    /// <summary>nav2_costmap_2d InflationLayer::computeCost (distance in metres).</summary>
    public static byte Cost(double distance, double inscribedRadius, double inflationRadius, double costScalingFactor)
    {
        if (double.IsPositiveInfinity(distance) || distance > inflationRadius)
        {
            return 0;
        }

        if (distance == 0)
        {
            return Lethal;
        }

        if (distance <= inscribedRadius)
        {
            return Inscribed;
        }

        var factor = Math.Exp(-costScalingFactor * (distance - inscribedRadius));
        return (byte)((Inscribed - 1) * factor);
    }

    /// <summary>Costmap2DPublisher translation table: 0→0, 253→99, 254→100, 1..252 → 1..98.</summary>
    public static byte ToOccupancy(byte cost) => cost switch
    {
        0 => 0,
        Lethal => 100,
        Inscribed => 99,
        255 => 255,
        _ => (byte)(1 + 97 * (cost - 1) / 251),
    };
}
