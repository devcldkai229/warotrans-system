namespace WaroTrans.Fleet.Features.GetSemanticLayers;

/// <summary>
/// The map's own Nav2 global costmap, as it is right after mapping: static layer (occupied cells of map.pgm = lethal)
/// + InflationLayer, optionally + the planner keep-out mask. No robot, no LiDAR, no traffic. Same formula and the same
/// costmap → OccupancyGrid translation as Nav2 (nav2_costmap_2d InflationLayer::computeCost, Costmap2DPublisher).
/// </summary>
public static class StaticCostmap
{
    public const byte Lethal = 254;
    public const byte Inscribed = 253;

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
