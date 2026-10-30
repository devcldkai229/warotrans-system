using System.Text;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using WaroTrans.UnitTests.Fleet.Traffic;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>Regression tests for the 2026-10-28 audit graph defects (G4, G6–G9, T4, T5, T17).</summary>
public class TrafficGraphSafetyRegressionTests
{
    private const EdgeDirection Both = EdgeDirection.BIDIRECTIONAL;
    private const EdgeDirection OneWay = EdgeDirection.ONE_WAY;

    private static RouteGraphEdgeInput Lane(string code, EdgeDirection direction, params (double X, double Y)[] points) =>
        new(code, points.Select(p => new RoutePoint(p.X, p.Y)).ToList(), direction, null, true);

    private static RouteGraphZoneInput Zone(string code, ZoneType type, double x0, double y0, double x1, double y1) =>
        new(code, type, [new(x0, y0), new(x1, y0), new(x1, y1), new(x0, y1), new(x0, y0)], null, true);

    private static CompiledTrafficGraph Compile(
        IReadOnlyList<RouteGraphEdgeInput> edges,
        IReadOnlyList<RouteGraphEndpointInput> endpoints,
        IReadOnlyList<RouteGraphZoneInput>? zones = null,
        int laneCapacity = 1,
        OccupancyGrid? occupancy = null) =>
        TrafficGraphCompiler.Compile(Input(edges, endpoints, zones, laneCapacity, occupancy)).Graph;

    private static TrafficCompileInput Input(
        IReadOnlyList<RouteGraphEdgeInput> edges,
        IReadOnlyList<RouteGraphEndpointInput> endpoints,
        IReadOnlyList<RouteGraphZoneInput>? zones = null,
        int laneCapacity = 1,
        OccupancyGrid? occupancy = null) =>
        new(
            "REG",
            "map",
            edges,
            endpoints,
            zones ?? [],
            edges.Select(e => new TrafficLaneMeta(e.Code, 1.0, e.Direction)).ToList(),
            (zones ?? []).Select(z => new TrafficZoneMeta(z.Code, z.ZoneType)).ToList(),
            TrafficFootprintOptions.Default,
            occupancy);

    // ---------------------------------------------------------------- G7: occupancy rows

    [Fact]
    public void G7_occupancy_cell_lookup_counts_rows_from_the_bottom_like_map_server()
    {
        // 4×4 at 1 m: only the TOP-LEFT pixel (PGM row 0) is an obstacle → world cell x∈[0,1), y∈[3,4).
        var pixels = Enumerable.Repeat((byte)255, 16).ToArray();
        pixels[0] = 0;
        var grid = OccupancyGrid.Load(EncodeP5(4, 4, pixels), 1.0, 0, 0, false, 0.65, 0.25);

        Assert.Equal(0, grid.ClearanceAt(0.5, 3.5));   // the obstacle itself
        Assert.True(grid.ClearanceAt(0.5, 0.5) > 1.5); // bottom-left is far from it
    }

    // ---------------------------------------------------------------- G4: graph hash

    [Fact]
    public void G4_graph_hash_changes_with_occupancy_so_two_compiles_cannot_share_ids()
    {
        RouteGraphEdgeInput[] edges = [Lane("E-1", Both, (0, 0), (2, 0))];
        RouteGraphEndpointInput[] endpoints = [new("EP-A", 0, 0, true), new("EP-B", 2, 0, true)];
        var grid = OccupancyGrid.Load(EncodeP5(4, 4, Enumerable.Repeat((byte)255, 16).ToArray()), 1.0, -1, -2, false, 0.65, 0.25);

        var without = TrafficGraphCompiler.ComputeGraphHash(Input(edges, endpoints));
        var with = TrafficGraphCompiler.ComputeGraphHash(Input(edges, endpoints, occupancy: grid));

        Assert.NotEqual(without, with);
        Assert.Equal(without, TrafficGraphCompiler.ComputeGraphHash(Input(edges, endpoints)));
    }

    // ---------------------------------------------------------------- G6: straight lane through endpoints

    [Fact]
    public void G6_endpoint_on_lane_keeps_stored_pose_and_splits_the_lane()
    {
        // Within vertex snap (5 cm): station stays at stored (x,y); lane is split through that pose.
        var graph = Compile(
            [Lane("E-1", Both, (0, 0), (4, 0))],
            [new("EP-A", 0, 0, true), new("EP-BAY", 2, 0.04, true), new("EP-B", 4, 0, true)]);

        var bay = graph.Nodes.Single(n => n.EndpointCodes.Contains("EP-BAY"));
        Assert.Equal(2, bay.X, 9);
        Assert.Equal(0.04, bay.Y, 9);
        Assert.DoesNotContain(graph.Edges, e => e.IsConnector);
    }

    // ---------------------------------------------------------------- G8 / G9: junction links

    [Fact]
    public void G9_junction_link_running_along_the_zone_edge_still_belongs_to_the_zone()
    {
        // Lane ends 3 cm under the top edge: the link's midpoint is closer than 5 cm to the boundary.
        // Occupancy lock uses SINGLE_OCCUPANCY; JUNCTION alone is connectivity only.
        var graph = Compile(
            [Lane("E-IN", OneWay, (-1, 0.47), (0.2, 0.47)), Lane("E-OUT", OneWay, (1.8, 0.47), (3, 0.47))],
            [new("EP-A", -1, 0.47, true), new("EP-B", 3, 0.47, true)],
            [Zone("Z-J", ZoneType.SINGLE_OCCUPANCY, 0, -0.5, 2, 0.5)]);

        var links = graph.Edges.Where(e => e.IsJunction).ToList();
        Assert.NotEmpty(links);
        Assert.All(links, l => Assert.Contains("Z-J", l.ZoneCodes));
        var junction = graph.Resources.Single(r => r.Id == "junction:Z-J");
        Assert.All(links, l => Assert.Contains(l.Id, junction.EdgeIds));
    }

    [Fact]
    public void G8_no_stop_zone_over_a_junction_adds_no_extra_links()
    {
        RouteGraphEdgeInput[] edges =
        [
            Lane("E-W", Both, (-1, 0), (0.9, 0)), Lane("E-E", Both, (1.1, 0), (3, 0)),
            // Two lane ends 0.25 m beyond the junction (outside its capture) but inside the wider NO_STOP label:
            // the label must not chord them together straight through the junction.
            Lane("E-N", Both, (1, 0.55), (1, 2)), Lane("E-S", Both, (1, -0.55), (1, -2))
        ];
        RouteGraphEndpointInput[] endpoints =
            [new("EP-W", -1, 0, true), new("EP-E", 3, 0, true), new("EP-N", 1, 2, true), new("EP-S", 1, -2, true)];
        var junction = Zone("Z-J", ZoneType.JUNCTION, 0.8, -0.3, 1.2, 0.3);
        var noStop = Zone("Z-NS", ZoneType.NO_STOP, 0.5, -0.6, 1.5, 0.6);

        var only = Compile(edges, endpoints, [junction]).Edges.Count(e => e.IsJunction);
        var both = Compile(edges, endpoints, [junction, noStop]).Edges.Count(e => e.IsJunction);

        Assert.True(only > 0);
        Assert.Equal(only, both);
    }

    [Fact]
    public void G10_station_inside_a_junction_stays_at_stored_pose_without_connector_spur()
    {
        // EP-DOCK is inside the junction polygon; attach uses arrival→departure links only (no two-way spur).
        var graph = Compile(
            [Lane("E-W", Both, (-1, 0), (0, 0)), Lane("E-E", Both, (0.6, 0), (2, 0))],
            [new("EP-W", -1, 0, true), new("EP-E", 2, 0, true), new("EP-DOCK", 0.3, 0.1, true)],
            [Zone("Z-J", ZoneType.JUNCTION, -0.1, -0.3, 0.7, 0.3)]);

        var dock = graph.Nodes.Single(n => n.EndpointCodes.Contains("EP-DOCK"));
        Assert.Equal(0.3, dock.X, 9);
        Assert.Equal(0.1, dock.Y, 9);
        Assert.DoesNotContain(graph.Edges, e => e.IsConnector);
    }

    // ---------------------------------------------------------------- T4: crossing without a zone

    [Fact]
    public void T4_two_lanes_crossing_without_a_zone_share_a_node_mutex()
    {
        var graph = Compile(
            [Lane("E-X", Both, (0, 0), (1, 0), (2, 0)), Lane("E-Y", Both, (1, -1), (1, 0), (1, 1))],
            [new("EP-W", 0, 0, true), new("EP-E", 2, 0, true), new("EP-S", 1, -1, true), new("EP-N", 1, 1, true)]);

        var cross = graph.Nodes.Single(n => Math.Abs(n.X - 1) < 1e-9 && Math.Abs(n.Y) < 1e-9);
        var mutex = graph.Resources.Single(r => r.Id == $"node:{cross.Id}");
        var codes = mutex.EdgeIds.SelectMany(id => graph.EdgeById[id].EdgeCodes).Distinct().ToList();
        Assert.Contains("E-X", codes);
        Assert.Contains("E-Y", codes);
        Assert.Equal(1, mutex.Capacity);
    }

    [Fact]
    public void T4_second_robot_crossing_an_occupied_intersection_is_queued_not_granted()
    {
        var sim = new FakeRobotSim(Compile(
            [Lane("E-X", Both, (0, 0), (1, 0), (2, 0)), Lane("E-Y", Both, (1, -1), (1, 0), (1, 1))],
            [new("EP-W", 0, 0, true), new("EP-E", 2, 0, true), new("EP-S", 1, -1, true), new("EP-N", 1, 1, true)]));
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        var first = sim.AcquireNextSegment(a, 0, 0, Station(sim, "EP-E"));
        var second = sim.AcquireNextSegment(b, 1, -1, Station(sim, "EP-N"));

        Assert.True(first.Granted);
        Assert.False(second.Granted);
        Assert.True(second.Queued);
    }

    // ---------------------------------------------------------------- T5: on-lane bay (no synthetic connector)

    [Fact]
    public void T5_on_lane_bay_has_no_connector_spur()
    {
        var graph = Compile(
            [Lane("E-1", Both, (0, 0), (4, 0))],
            [new("EP-A", 0, 0, true), new("EP-BAY", 2, 0, true), new("EP-B", 4, 0, true)]);

        var bayNode = graph.Nodes.Single(n => n.EndpointCodes.Contains("EP-BAY"));
        Assert.Equal(2, bayNode.X, 9);
        Assert.Equal(0, bayNode.Y, 9);
        Assert.DoesNotContain(graph.Edges, e => e.IsConnector);
        Assert.True(bayNode.IsStation || bayNode.IsSafeStop || bayNode.EndpointCodes.Contains("EP-BAY"));
    }

    // ---------------------------------------------------------------- T17: opposing traffic

    [Fact]
    public void T17_capacity_two_bidirectional_lane_still_excludes_opposing_robots()
    {
        var sim = new FakeRobotSim(Compile(
            [Lane("E-1", Both, (0, 0), (2, 0), (4, 0), (6, 0))],
            [new("EP-A", 0, 0, true), new("EP-B", 6, 0, true)],
            laneCapacity: 2));
        Assert.Contains(sim.Graph.Resources, r => r.Kind == TrafficResourceKind.NarrowBidirectional);

        var east = sim.AcquireNextSegment(Guid.NewGuid(), 0, 0, Station(sim, "EP-B"));
        var west = sim.AcquireNextSegment(Guid.NewGuid(), 6, 0, Station(sim, "EP-A"));

        Assert.True(east.Granted);
        Assert.False(west.Granted);
    }

    // ---------------------------------------------------------------- V019 closeout: stopline / exit detection

    [Fact]
    public void Bidirectional_junction_corridor_gets_stopline_at_external_entry()
    {
        // Cross: N–S and E–W bidirectional through a JUNCTION zone; approaches are non-critical.
        RouteGraphEdgeInput[] edges =
        [
            Lane("E-W", Both, (-2, 0), (0, 0)),
            Lane("E-E", Both, (0, 0), (2, 0)),
            Lane("E-S", Both, (0, -2), (0, 0)),
            Lane("E-N", Both, (0, 0), (0, 2)),
            Lane("J-WE", Both, (-0.4, 0), (0.4, 0)),
            Lane("J-SN", Both, (0, -0.4), (0, 0.4)),
        ];
        var result = TrafficGraphCompiler.Compile(Input(
            edges,
            [new("EP-W", -2, 0, true), new("EP-E", 2, 0, true), new("EP-S", 0, -2, true), new("EP-N", 0, 2, true)],
            [Zone("Z-J", ZoneType.JUNCTION, -0.5, -0.5, 0.5, 0.5)]));

        Assert.DoesNotContain(result.Issues, i => i.Code == TrafficGraphValidator.CorridorNoStopline);
        Assert.NotEmpty(result.Graph.Stoplines);
        Assert.All(result.Graph.Corridors, c =>
            Assert.Contains(result.Graph.Stoplines, s => s.CorridorId == c.Id));
    }

    [Fact]
    public void Narrow_bidirectional_finds_exit_via_undirected_multi_hop()
    {
        // Narrow both-ways segment; safe stop is two hops out on an undirected approach.
        RouteGraphEdgeInput[] edges =
        [
            Lane("NARROW", Both, (0, 0), (1, 0)),
            Lane("APPROACH", Both, (-2, 0), (0, 0)),
        ];
        var result = TrafficGraphCompiler.Compile(Input(
            edges,
            [new("EP-SAFE", -2, 0, true), new("EP-FAR", 1, 0, true)]));

        Assert.Contains(result.Graph.Resources, r => r.Id == "narrow:NARROW");
        Assert.True(result.Graph.ExitSafeStopsByResourceId.TryGetValue("narrow:NARROW", out var exits));
        Assert.NotEmpty(exits);
        Assert.DoesNotContain(result.Issues, i =>
            i.Code == TrafficGraphCompiler.CriticalNoExit && i.RelatedCodes.Contains("narrow:NARROW"));
    }

    private static int Station(FakeRobotSim sim, string code) =>
        sim.Graph.Stations.First(s => s.EndpointCode == code).NodeId;

    private static byte[] EncodeP5(int width, int height, byte[] pixels)
    {
        var header = Encoding.ASCII.GetBytes($"P5\n{width} {height}\n255\n");
        return [.. header, .. pixels];
    }
}
