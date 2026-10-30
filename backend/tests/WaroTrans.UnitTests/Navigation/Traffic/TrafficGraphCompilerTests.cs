using System.Text;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Navigation.Traffic;

public class TrafficGraphCompilerTests
{
    private static RouteGraphEdgeInput Lane(string code, EdgeDirection direction, params (double X, double Y)[] points) =>
        new(code, points.Select(p => new RoutePoint(p.X, p.Y)).ToList(), direction, null, true);

    private static RouteGraphEndpointInput Stop(string code, double x, double y) => new(code, x, y, true);

    private static RouteGraphZoneInput Zone(
        string code, ZoneType type, double x0, double y0, double x1, double y1) =>
        new(code, type,
            [new RoutePoint(x0, y0), new RoutePoint(x1, y0), new RoutePoint(x1, y1), new RoutePoint(x0, y1), new RoutePoint(x0, y0)],
            null, true);

    private static TrafficCompileInput Input(
        IEnumerable<RouteGraphEdgeInput> edges,
        IEnumerable<RouteGraphEndpointInput> endpoints,
        IEnumerable<RouteGraphZoneInput>? zones = null,
        OccupancyGrid? occupancy = null,
        TrafficFootprintOptions? footprint = null)
    {
        var edgeList = edges.ToList();
        var zoneList = zones?.ToList() ?? [];
        return new TrafficCompileInput(
            "MAP-TEST",
            "map",
            edgeList,
            endpoints.ToList(),
            zoneList,
            edgeList.Select(e => new TrafficLaneMeta(e.Code, WidthMeters: 1.0, e.Direction)).ToList(),
            zoneList.Select(z => new TrafficZoneMeta(z.Code, z.ZoneType)).ToList(),
            footprint ?? TrafficFootprintOptions.Default,
            occupancy);
    }

    [Fact]
    public void Compile_twice_is_deterministic_same_hash_and_edge_ids()
    {
        var input = Input(
            [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0, 0), (2, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 2, 0)]);

        var a = TrafficGraphCompiler.Compile(input);
        var b = TrafficGraphCompiler.Compile(input);

        Assert.Equal(a.Graph.GraphHash, b.Graph.GraphHash);
        Assert.Equal(a.Graph.Edges.Select(e => e.Id), b.Graph.Edges.Select(e => e.Id));
        Assert.Equal(a.Graph.Nodes.Select(n => (n.Id, n.X, n.Y)), b.Graph.Nodes.Select(n => (n.Id, n.X, n.Y)));
        Assert.False(string.IsNullOrWhiteSpace(a.Graph.GraphHash));
        Assert.Equal(64, a.Graph.GraphHash.Length); // SHA-256 hex
    }

    [Fact]
    public void One_way_lane_has_single_direction_bidirectional_shares_lane_resource()
    {
        var oneWay = TrafficGraphCompiler.Compile(Input(
            [Lane("E-OW", EdgeDirection.ONE_WAY, (0, 0), (2, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 2, 0)]));

        var ow = oneWay.Graph.Edges.Where(e => e.EdgeCodes.Contains("E-OW")).ToList();
        Assert.Single(ow);
        var start = oneWay.Graph.Nodes.Single(n => Math.Abs(n.X) < 1e-6 && Math.Abs(n.Y) < 1e-6);
        var end = oneWay.Graph.Nodes.Single(n => Math.Abs(n.X - 2) < 1e-6);
        Assert.Equal(start.Id, ow[0].StartId);
        Assert.Equal(end.Id, ow[0].EndId);

        var both = TrafficGraphCompiler.Compile(Input(
            [Lane("E-BW", EdgeDirection.BIDIRECTIONAL, (0, 0), (2, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 2, 0)]));

        var directed = both.Graph.Edges.Where(e => e.EdgeCodes.Contains("E-BW")).ToList();
        Assert.Equal(2, directed.Count);
        var lane = Assert.Single(both.Graph.Resources, r => r.Kind == TrafficResourceKind.Lane && r.RelatedCodes.Contains("E-BW"));
        Assert.Equal(2, lane.EdgeIds.Length);
    }

    [Fact]
    public void Junction_zone_builds_conflict_group_and_critical_corridor()
    {
        // Two lanes meeting at a junction box around (1,0).
        RouteGraphEdgeInput[] edges =
        [
            Lane("E-W", EdgeDirection.BIDIRECTIONAL, (0, 0), (0.9, 0)),
            Lane("E-E", EdgeDirection.BIDIRECTIONAL, (1.1, 0), (2, 0)),
            Lane("E-N", EdgeDirection.BIDIRECTIONAL, (1, 0.1), (1, 1))
        ];
        // Occupancy mutex is SINGLE_OCCUPANCY; JUNCTION alone is connectivity only.
        var zones = new[] { Zone("Z-J", ZoneType.SINGLE_OCCUPANCY, 0.85, -0.2, 1.15, 0.25) };

        var result = TrafficGraphCompiler.Compile(Input(edges, [Stop("EP-A", 0, 0), Stop("EP-B", 2, 0), Stop("EP-C", 1, 1)], zones));

        Assert.Contains(result.Graph.Resources, r => r.Kind == TrafficResourceKind.JunctionConflict && r.RelatedCodes.Contains("Z-J"));
        Assert.NotEmpty(result.Graph.Corridors);
        Assert.Contains(result.Graph.Edges, e => e.IsJunction || e.InCriticalCorridor);
        // Occupancy capacity is owned by JunctionConflict — no duplicate CriticalCorridor for those edges.
        var junction = Assert.Single(result.Graph.Resources, r => r.Kind == TrafficResourceKind.JunctionConflict);
        Assert.DoesNotContain(result.Graph.Resources, r =>
            r.Kind == TrafficResourceKind.CriticalCorridor &&
            r.EdgeIds.Any(id => junction.EdgeIds.Contains(id)));
    }

    [Fact]
    public void Two_single_occupancy_zones_do_not_cross_include_edges()
    {
        RouteGraphEdgeInput[] edges =
        [
            Lane("E-A", EdgeDirection.BIDIRECTIONAL, (0, 0), (1, 0)),
            Lane("E-B", EdgeDirection.BIDIRECTIONAL, (3, 0), (4, 0)),
            Lane("E-MID", EdgeDirection.BIDIRECTIONAL, (1.2, 0), (2.8, 0))
        ];
        var zones = new[]
        {
            Zone("Z-J1", ZoneType.SINGLE_OCCUPANCY, -0.1, -0.2, 1.1, 0.2),
            Zone("Z-J2", ZoneType.SINGLE_OCCUPANCY, 2.9, -0.2, 4.1, 0.2)
        };

        var result = TrafficGraphCompiler.Compile(Input(
            edges,
            [Stop("EP-A", 0, 0), Stop("EP-B", 4, 0)],
            zones));

        var j1 = Assert.Single(result.Graph.Resources, r => r.Id == "junction:Z-J1");
        var j2 = Assert.Single(result.Graph.Resources, r => r.Id == "junction:Z-J2");
        Assert.Empty(j1.EdgeIds.Intersect(j2.EdgeIds));
        Assert.All(j1.EdgeIds, id =>
        {
            var edge = result.Graph.EdgeById[id];
            Assert.Contains("Z-J1", edge.ZoneCodes);
        });
    }

    [Fact]
    public void Bidirectional_lane_emits_narrow_resource_and_safe_stops()
    {
        var result = TrafficGraphCompiler.Compile(Input(
            [Lane("E-BW", EdgeDirection.BIDIRECTIONAL, (0, 0), (3, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 3, 0)]));

        Assert.Contains(result.Graph.Resources, r =>
            r.Kind == TrafficResourceKind.NarrowBidirectional && r.RelatedCodes.Contains("E-BW"));
        Assert.NotEmpty(result.Graph.SafeStopNodeIds);
        Assert.All(result.Graph.SafeStopNodeIds, id => Assert.True(result.Graph.IsSafeStop(id)));
        Assert.NotEmpty(result.Graph.ResourcesByEdgeId);
    }

    [Fact]
    public void Sample_bidirectional_lane_validates_without_errors()
    {
        var result = TrafficGraphCompiler.Compile(Input(
            [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0, 0), (2, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 2, 0)]));
        var report = TrafficGraphValidator.Validate(Guid.NewGuid(), result.Graph, result.Issues);
        Assert.DoesNotContain(report.Issues, i => i.Severity == TrafficIssueSeverity.Error);
        Assert.True(report.IsValid);
    }

    [Fact]
    public void Legacy_single_occupancy_junction_emits_warning()
    {
        RouteGraphEdgeInput[] edges =
        [
            Lane("E-W", EdgeDirection.BIDIRECTIONAL, (0, 0), (0.9, 0)),
            Lane("E-E", EdgeDirection.BIDIRECTIONAL, (1.1, 0), (2, 0))
        ];
        var zones = new[] { Zone("Z-LEG", ZoneType.SINGLE_OCCUPANCY, 0.85, -0.2, 1.15, 0.2) };

        var result = TrafficGraphCompiler.Compile(Input(edges, [Stop("EP-A", 0, 0), Stop("EP-B", 2, 0)], zones));

        Assert.Contains(result.Issues, i => i.Code == TrafficGraphCompiler.LegacyJunctionZone && i.RelatedCodes.Contains("Z-LEG"));
    }

    [Fact]
    public void Synthetic_occupancy_clearance_fail_and_pass()
    {
        // 20×20 free grid, resolution 0.1 m, origin at 0.
        var free = BuildPgm(20, 20, fill: 254);
        var freeGrid = OccupancyGrid.Load(free, resolution: 0.1, originX: 0, originY: 0, negate: false, occupiedThreshold: 0.65, freeThreshold: 0.25);

        var pass = TrafficGraphCompiler.Compile(Input(
            [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0.5, 0.5), (1.5, 0.5))],
            [Stop("EP-A", 0.5, 0.5), Stop("EP-B", 1.5, 0.5)],
            occupancy: freeGrid));
        Assert.DoesNotContain(pass.Issues, i => i.Code == TrafficGraphCompiler.InsufficientClearance);

        // Wall along the lane centreline.
        var blocked = BuildPgm(20, 20, fill: 254);
        // Paint a vertical wall of occupied pixels at x≈1.0 (col 10).
        PaintColumn(blocked, width: 20, height: 20, col: 10, value: 0);
        var blockedGrid = OccupancyGrid.Load(blocked, 0.1, 0, 0, negate: false, 0.65, 0.25);

        var fail = TrafficGraphCompiler.Compile(Input(
            [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0.5, 1.0), (1.5, 1.0))],
            [Stop("EP-A", 0.5, 1.0), Stop("EP-B", 1.5, 1.0)],
            occupancy: blockedGrid));
        Assert.Contains(fail.Issues, i => i.Code == TrafficGraphCompiler.InsufficientClearance);
    }

    [Fact]
    public void One_way_trap_is_reported_by_validator()
    {
        // A → B one-way only; B cannot leave.
        var result = TrafficGraphCompiler.Compile(Input(
            [Lane("E-1", EdgeDirection.ONE_WAY, (0, 0), (2, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 2, 0)]));

        var report = TrafficGraphValidator.Validate(Guid.NewGuid(), result.Graph, result.Issues);
        Assert.False(report.IsValid);
        Assert.Contains(report.Issues, i =>
            i.Code is TrafficGraphValidator.OneWayTrap or RouteGraphBuilder.EndpointUnreachable or TrafficGraphValidator.EndpointDisconnected);
    }

    [Fact]
    public void Footprint_defaults_match_plan()
    {
        var fp = TrafficFootprintOptions.Default;
        Assert.Equal(0.32, fp.LengthMeters);
        Assert.Equal(0.26, fp.WidthMeters);
        Assert.Equal(0.02, fp.PaddingMeters);
        Assert.Equal(0.15, fp.HalfWidth, 3);
        Assert.InRange(fp.TurnRadius, 0.225, 0.227);
    }

    [Fact]
    public void Cache_only_stores_published()
    {
        var cache = new CompiledTrafficGraphCache();
        var input = Input(
            [Lane("E-1", EdgeDirection.BIDIRECTIONAL, (0, 0), (1, 0))],
            [Stop("EP-A", 0, 0), Stop("EP-B", 1, 0)]);
        var compiled = TrafficGraphCompiler.Compile(input).Graph;
        var id = Guid.NewGuid();

        cache.SetPublished(id, MapStatus.DRAFT, compiled);
        Assert.Equal(0, cache.Count);

        cache.SetPublished(id, MapStatus.PUBLISHED, compiled);
        Assert.Equal(1, cache.Count);
        Assert.True(cache.TryGet(id, compiled.GraphHash, out var got));
        Assert.Same(compiled, got);
    }

    private static byte[] BuildPgm(int width, int height, byte fill)
    {
        var header = Encoding.ASCII.GetBytes($"P5\n{width} {height}\n255\n");
        var pixels = new byte[width * height];
        Array.Fill(pixels, fill);
        var result = new byte[header.Length + pixels.Length];
        header.CopyTo(result, 0);
        pixels.CopyTo(result, header.Length);
        return result;
    }

    private static void PaintColumn(byte[] pgm, int width, int height, int col, byte value)
    {
        // Skip header to pixel payload.
        var offset = IndexOfPayload(pgm);
        for (var row = 0; row < height; row++)
        {
            pgm[offset + row * width + col] = value;
        }
    }

    private static int IndexOfPayload(byte[] pgm)
    {
        // After third newline following P5 / dims / maxval.
        var newlines = 0;
        for (var i = 0; i < pgm.Length; i++)
        {
            if (pgm[i] == (byte)'\n')
            {
                newlines++;
                if (newlines == 3)
                {
                    return i + 1;
                }
            }
        }

        throw new InvalidOperationException("PGM header not found.");
    }
}
