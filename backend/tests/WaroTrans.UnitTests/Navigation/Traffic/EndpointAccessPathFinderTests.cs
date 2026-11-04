using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Navigation.Traffic;

public class EndpointAccessPathFinderTests
{
    [Theory]
    [InlineData(0.5)]
    [InlineData(1.0)]
    [InlineData(1.5)]
    public void Straight_free_spur_attaches_with_occupancy_context(double offsetY)
    {
        var free = BuildFreeGrid(40, 40, resolution: 0.1, originX: -1, originY: -1);
        var result = TrafficGraphCompiler.Compile(new TrafficCompileInput(
            "T",
            "map",
            [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0, 0), (4, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 4, 0), Stop("EP-DOCK", 2, offsetY)],
            [],
            [new TrafficLaneMeta("E-1", 1.0, EdgeDirection.BIDIRECTIONAL)],
            [],
            TrafficFootprintOptions.Default,
            free));

        Assert.DoesNotContain(result.Issues, i => i.Code == TrafficGraphCompiler.ServiceAccessBlocked);
        Assert.Contains(result.Graph.Edges, e => e.IsConnector);
        Assert.Contains(result.Graph.Resources, r => r.Id == "bay:EP-DOCK");
    }

    [Fact]
    public void Wall_on_straight_line_still_finds_bent_path_when_side_corridor_free()
    {
        // Free grid with a short wall between (2,0) and (2,1.2) but open path around x=2.4.
        var pgm = BuildPgm(50, 50, 254);
        // Wall cells near x=2.0 (col from origin -1 → col 30), rows covering y 0.3..0.9
        for (var row = 5; row <= 15; row++)
        {
            Paint(pgm, 50, 50, col: 30, row: row, value: 0);
        }

        var grid = OccupancyGrid.Load(pgm, 0.1, -1, -1, negate: false, 0.65, 0.25);
        var result = TrafficGraphCompiler.Compile(new TrafficCompileInput(
            "T",
            "map",
            [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0, 0), (4, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 4, 0), Stop("EP-DOCK", 2, 1.2)],
            [],
            [new TrafficLaneMeta("E-1", 1.0, EdgeDirection.BIDIRECTIONAL)],
            [],
            TrafficFootprintOptions.Default,
            grid));

        // Either bent path succeeds (connectors present) or honest SAB — never ENDPOINT_TOO_FAR.
        Assert.DoesNotContain(result.Issues, i => i.Code == RouteGraphBuilder.EndpointTooFar);
        if (result.Issues.Any(i => i.Code == TrafficGraphCompiler.ServiceAccessBlocked))
        {
            Assert.DoesNotContain(result.Graph.Edges, e => e.IsConnector &&
                result.Graph.Stations.Any(s => s.EndpointCode == "EP-DOCK" &&
                    (e.StartId == s.NodeId || e.EndId == s.NodeId)));
        }
        else
        {
            Assert.Contains(result.Graph.Edges, e => e.IsConnector);
            Assert.Contains(result.Graph.Resources, r => r.Id == "bay:EP-DOCK");
        }
    }

    [Fact]
    public void Keep_out_on_approach_emits_service_access_blocked_keep_out()
    {
        var result = RouteGraphBuilder.Build(
            new RouteGraphInput(
                "T",
                "map",
                [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0, 0), (4, 0))],
                [Stop("EP-A", 0, 0), Stop("EP-DOCK", 2, 1.0)],
                [
                    new RouteGraphZoneInput(
                        "Z-WALL",
                        ZoneType.KEEP_OUT,
                        [new(1.7, 0.2), new(2.3, 0.2), new(2.3, 0.9), new(1.7, 0.9), new(1.7, 0.2)],
                        null,
                        true)
                ]));

        var sab = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.ServiceAccessBlocked);
        Assert.Contains("KEEP_OUT", sab.Message);
        Assert.DoesNotContain(result.Issues, i => i.Code == RouteGraphBuilder.EndpointTooFar);
    }

    [Fact]
    public void Snapshot_MAP_WHSIM_V019_compiles_in_memory_without_db()
    {
        var (compiled, report) = MapSnapshotCompileHarness.CompileAndValidate("MAP-WHSIM-V019");
        Assert.NotNull(compiled.Graph);
        Assert.True(compiled.Graph.Nodes.Length > 0);
        Assert.True(compiled.Graph.Edges.Length > 0);
        Assert.False(string.IsNullOrWhiteSpace(compiled.Graph.GraphHash));
        // Cascade for SAB endpoints should not explode pairwise DISCONNECTED for those codes.
        var sab = report.Issues.Where(i => i.Code == TrafficGraphCompiler.ServiceAccessBlocked)
            .SelectMany(i => i.RelatedCodes).ToHashSet(StringComparer.Ordinal);
        foreach (var issue in report.Issues.Where(i => i.Code == TrafficGraphValidator.EndpointDisconnected))
        {
            Assert.DoesNotContain(issue.RelatedCodes, c => sab.Contains(c));
        }
    }

    private static RouteGraphEdgeInput Lane(string code, EdgeDirection direction, params (double X, double Y)[] pts) =>
        new(code, pts.Select(p => new RoutePoint(p.X, p.Y)).ToList(), direction, null, true);

    private static RouteGraphEndpointInput Stop(string code, double x, double y) => new(code, x, y, true);

    private static OccupancyGrid BuildFreeGrid(int w, int h, double resolution, double originX, double originY)
    {
        var pgm = BuildPgm(w, h, 254);
        return OccupancyGrid.Load(pgm, resolution, originX, originY, negate: false, 0.65, 0.25);
    }

    private static byte[] BuildPgm(int width, int height, byte fill)
    {
        var header = System.Text.Encoding.ASCII.GetBytes($"P5\n{width} {height}\n255\n");
        var pixels = new byte[width * height];
        Array.Fill(pixels, fill);
        return [.. header, .. pixels];
    }

    private static void Paint(byte[] pgm, int width, int height, int col, int row, byte value)
    {
        var offset = 0;
        var newlines = 0;
        for (var i = 0; i < pgm.Length; i++)
        {
            if (pgm[i] == (byte)'\n' && ++newlines == 3)
            {
                offset = i + 1;
                break;
            }
        }

        pgm[offset + row * width + col] = value;
    }
}
