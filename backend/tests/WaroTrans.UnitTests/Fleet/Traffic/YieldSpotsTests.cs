using System.Collections.Immutable;
using System.Text;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// A robot that has to let another one pass steps aside close by (user, 2026-11-23: not all the way to a queue point
/// from the end of the shelf B lane).
/// </summary>
public sealed class YieldSpotsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "yieldspots-" + Guid.NewGuid().ToString("N"));

    public YieldSpotsTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try
        {
            Directory.Delete(_dir, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    private static SemanticTrafficPolicy Policy() => new(
        "fp-yield", Guid.NewGuid(), "MAP-TEST", CellSizeMeters: 0.10, HorizonMeters: 2.0,
        FootprintHalfLength: 0.18, FootprintHalfWidth: 0.155, [], [], PathToleranceMeters: 0.15,
        LaneHalfWidthMeters: 0.25, ZoneMarginMeters: 0.05);

    /// <summary>A free floor of <paramref name="w"/> x <paramref name="h"/> cells (5 cm) with a one-cell wall around it.</summary>
    private void WriteMap(int w, int h, Func<int, int, bool>? blocked = null)
    {
        File.WriteAllText(Path.Combine(_dir, "map.yaml"),
            "image: map.pgm\nmode: trinary\nresolution: 0.05\norigin: [0.0, 0.0, 0]\nnegate: 0\n");
        var header = Encoding.ASCII.GetBytes($"P5\n{w} {h}\n255\n");
        var pixels = new byte[w * h];
        for (var row = 0; row < h; row++)
        {
            for (var c = 0; c < w; c++)
            {
                var wall = row == 0 || c == 0 || row == h - 1 || c == w - 1 || (blocked?.Invoke(c, h - 1 - row) ?? false);
                pixels[row * w + c] = wall ? (byte)0 : (byte)254;
            }
        }

        File.WriteAllBytes(Path.Combine(_dir, "map.pgm"), header.Concat(pixels).ToArray());
    }

    private static ImmutableArray<SemanticPlanPose> Line(double x0, double y0, double x1, double y1)
    {
        var n = (int)Math.Ceiling(Math.Sqrt(Math.Pow(x1 - x0, 2) + Math.Pow(y1 - y0, 2)) / 0.05);
        var yaw = Math.Atan2(y1 - y0, x1 - x0);
        return Enumerable.Range(0, n + 1)
            .Select(i => new SemanticPlanPose(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, yaw)).ToImmutableArray();
    }

    [Fact]
    public void A_robot_on_the_other_robots_way_steps_aside_close_by()
    {
        WriteMap(60, 60); // 3 x 3 m
        var grid = FreeFloorGrid.TryLoad(_dir);
        Assert.NotNull(grid);
        var policy = Policy();
        var way = SemanticReservation.WholePathResources(policy, Line(0.3, 1.5, 2.7, 1.5));
        var spot = YieldSpots.Find(policy, grid!, 1.5, 1.5, way, [(0.4, 1.5)], margin: 0.05);

        Assert.NotNull(spot);
        var (x, y, yaw) = spot.Value;
        Assert.True(Math.Sqrt(Math.Pow(x - 1.5, 2) + Math.Pow(y - 1.5, 2)) <= 0.8, $"spot ({x:F2}, {y:F2}) is not close by");
        var body = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.StandingCells(policy, x, y, yaw, 0.05, body);
        Assert.False(body.Overlaps(way));
    }

    [Fact]
    public void No_spot_in_a_corridor_too_narrow_to_pass()
    {
        // 0.6 m wide corridor: nowhere beside the way.
        WriteMap(60, 14);
        var grid = FreeFloorGrid.TryLoad(_dir)!;
        var policy = Policy();
        var way = SemanticReservation.WholePathResources(policy, Line(0.3, 0.35, 2.7, 0.35));
        Assert.Null(YieldSpots.Find(policy, grid, 1.5, 0.35, way, [(0.4, 0.35)], margin: 0.05));
    }

    [Fact]
    public void The_grid_measures_clearance_from_walls()
    {
        WriteMap(40, 40);
        var grid = FreeFloorGrid.TryLoad(_dir)!;
        Assert.InRange(grid.ClearanceAt(1.0, 1.0), 0.9, 1.0);
        Assert.InRange(grid.ClearanceAt(0.12, 1.0), 0.03, 0.10);
        Assert.Equal(0, grid.ClearanceAt(-1, -1));
    }
}
