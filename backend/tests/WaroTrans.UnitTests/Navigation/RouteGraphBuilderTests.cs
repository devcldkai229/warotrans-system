using System.Text.Json;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;

namespace WaroTrans.UnitTests.Navigation;

public class RouteGraphBuilderTests
{
    private const EdgeDirection OneWay = EdgeDirection.ONE_WAY;
    private const EdgeDirection Both = EdgeDirection.BIDIRECTIONAL;

    private static RouteGraphEdgeInput Lane(string code, EdgeDirection direction, params (double X, double Y)[] points) =>
        new(code, points.Select(p => new RoutePoint(p.X, p.Y)).ToList(), direction, null, true);

    private static RouteGraphEndpointInput Stop(string code, double x, double y) => new(code, x, y, true);

    private static RouteGraphResult Build(IEnumerable<RouteGraphEdgeInput> edges, params RouteGraphEndpointInput[] endpoints) =>
        RouteGraphBuilder.Build(new RouteGraphInput("MAP-TEST", "map", edges.ToList(), endpoints));

    private static RouteGraphNode NodeAt(RouteGraph graph, double x, double y) =>
        graph.Nodes.Single(n => Math.Abs(n.X - x) < 1e-6 && Math.Abs(n.Y - y) < 1e-6);

    private static bool HasEdge(RouteGraph graph, (double X, double Y) from, (double X, double Y) to) =>
        graph.Edges.Any(e => e.StartId == NodeAt(graph, from.X, from.Y).Id && e.EndId == NodeAt(graph, to.X, to.Y).Id);

    private static List<string> ErrorCodes(RouteGraphResult result) =>
        result.Issues.Where(i => i.Severity == RouteGraphIssueSeverity.Error).Select(i => i.Code).ToList();

    [Fact]
    public void One_way_polyline_becomes_nodes_and_edges_in_drawing_order()
    {
        var result = Build([Lane("E-1", OneWay, (0, 0), (1, 0), (1, 1))]);

        Assert.Equal(3, result.Graph.Nodes.Count);
        Assert.Equal(2, result.Graph.Edges.Count);
        Assert.True(HasEdge(result.Graph, (0, 0), (1, 0)));
        Assert.True(HasEdge(result.Graph, (1, 0), (1, 1)));
        Assert.False(HasEdge(result.Graph, (1, 0), (0, 0)));
        Assert.All(result.Graph.Edges, e => Assert.Equal(["E-1"], e.EdgeCodes));
    }

    [Fact]
    public void Bidirectional_polyline_gets_both_directions()
    {
        var result = Build([Lane("E-1", Both, (0, 0), (1, 0), (1, 1))]);

        Assert.Equal(3, result.Graph.Nodes.Count);
        Assert.Equal(4, result.Graph.Edges.Count);
        Assert.True(HasEdge(result.Graph, (1, 1), (1, 0)));
        Assert.True(HasEdge(result.Graph, (1, 0), (0, 0)));
    }

    [Fact]
    public void Edges_sharing_an_end_point_share_one_node()
    {
        var result = Build([Lane("E-1", OneWay, (0, 0), (1, 0)), Lane("E-2", OneWay, (1.02, 0.01), (2, 0))]);

        Assert.Equal(3, result.Graph.Nodes.Count);
        Assert.Equal(2, result.Graph.Edges.Count);
        Assert.True(HasEdge(result.Graph, (0, 0), (1, 0)));
        Assert.True(HasEdge(result.Graph, (1, 0), (2, 0)));       // E-2 starts on E-1's end node (within 5 cm)
    }

    [Fact]
    public void A_lane_ending_in_the_middle_of_another_splits_it_into_a_junction()
    {
        var result = Build([Lane("E-1", OneWay, (0, 0), (2, 0)), Lane("E-2", OneWay, (1, 0), (1, 1))]);

        Assert.Equal(4, result.Graph.Nodes.Count);
        Assert.Equal(3, result.Graph.Edges.Count);
        Assert.True(HasEdge(result.Graph, (0, 0), (1, 0)));
        Assert.True(HasEdge(result.Graph, (1, 0), (2, 0)));
        Assert.True(HasEdge(result.Graph, (1, 0), (1, 1)));
    }

    [Fact]
    public void Endpoint_on_a_node_is_attached_without_connector()
    {
        var result = Build([Lane("E-1", Both, (0, 0), (2, 0))], Stop("EP-A", 2, 0), Stop("EP-B", 0.01, 0));

        Assert.Equal(["EP-A"], NodeAt(result.Graph, 2, 0).EndpointCodes);
        Assert.Equal(["EP-B"], NodeAt(result.Graph, 0, 0).EndpointCodes);
        Assert.DoesNotContain(result.Graph.Edges, e => e.IsConnector);
        Assert.Empty(result.Issues);
    }

    [Fact]
    public void Endpoint_beside_a_lane_is_an_error_without_synthetic_spur()
    {
        // 0.2 m off the lane (> vertex snap): no foot↔endpoint connector (would reverse ONE_WAY).
        var result = Build([Lane("E-1", Both, (0, 0), (2, 0))], Stop("EP-A", 1, 0.2), Stop("EP-END", 2, 0));

        Assert.Equal(["EP-A"], NodeAt(result.Graph, 1, 0.2).EndpointCodes);
        Assert.DoesNotContain(result.Graph.Edges, e => e.IsConnector);
        var issue = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.EndpointTooFar);
        Assert.Equal(["EP-A"], issue.RelatedCodes);
        Assert.True(result.HasErrors);
    }

    [Fact]
    public void Endpoint_further_than_vertex_snap_is_an_error()
    {
        var result = Build([Lane("E-1", Both, (0, 0), (2, 0))], Stop("EP-FAR", 1, 0.6));

        var issue = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.EndpointTooFar);
        Assert.Equal(RouteGraphIssueSeverity.Error, issue.Severity);
        Assert.Equal(["EP-FAR"], issue.RelatedCodes);
        Assert.Contains("0.60 m", issue.Message);
        Assert.True(result.HasErrors);
    }

    [Fact]
    public void Inactive_edges_and_disabled_endpoints_are_ignored()
    {
        var inactive = Lane("E-OFF", Both, (5, 5), (6, 5)) with { IsActive = false };
        var result = Build(
            [Lane("E-1", Both, (0, 0), (2, 0)), inactive],
            Stop("EP-A", 0, 0),
            new RouteGraphEndpointInput("EP-OFF", 9, 9, IsEnabled: false));

        Assert.Equal(2, result.Graph.Nodes.Count);
        Assert.DoesNotContain(result.Graph.Edges, e => e.EdgeCodes.Contains("E-OFF"));
        Assert.Empty(result.Issues);                                 // EP-OFF is far away but disabled
    }

    [Fact]
    public void Max_speed_becomes_abs_speed_limit_metadata()
    {
        var slow = Lane("E-SLOW", OneWay, (0, 0), (1, 0)) with { MaxSpeed = 0.15 };
        var result = Build([slow]);

        var edge = Assert.Single(result.Graph.Edges);
        Assert.Equal(0.15, edge.AbsSpeedLimit);
        using var json = JsonDocument.Parse(RouteGraphGeoJsonWriter.Write(result.Graph));
        var feature = json.RootElement.GetProperty("features").EnumerateArray()
            .Single(f => f.GetProperty("geometry").GetProperty("type").GetString() == "MultiLineString");
        Assert.Equal(0.15, feature.GetProperty("properties").GetProperty("metadata").GetProperty("abs_speed_limit").GetDouble());
        Assert.Equal("E-SLOW", feature.GetProperty("properties").GetProperty("metadata").GetProperty("edge_code").GetString());
    }

    [Fact]
    public void A_one_way_lane_that_traps_an_endpoint_is_reported_as_unreachable()
    {
        var result = Build([Lane("E-1", OneWay, (0, 0), (2, 0))], Stop("EP-START", 0, 0), Stop("EP-END", 2, 0));

        var issue = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.EndpointUnreachable);
        Assert.Equal(RouteGraphIssueSeverity.Error, issue.Severity);
        Assert.Equal(["EP-END", "EP-START"], issue.RelatedCodes);    // from EP-END nothing leads back
    }

    [Fact]
    public void Same_input_gives_the_same_file_whatever_the_drawing_order()
    {
        RouteGraphEdgeInput[] edges =
        [
            Lane("E-2", OneWay, (1, 0), (1, 1)),
            Lane("E-1", Both, (0, 0), (2, 0)),
            Lane("E-3", Both, (1, 1), (0, 0))
        ];
        var first = RouteGraphGeoJsonWriter.Write(Build(edges, Stop("EP-A", 2, 0.3), Stop("EP-B", 0, 0)).Graph);
        var again = RouteGraphGeoJsonWriter.Write(Build(edges, Stop("EP-A", 2, 0.3), Stop("EP-B", 0, 0)).Graph);
        var reversed = RouteGraphGeoJsonWriter.Write(Build(edges.Reverse(), Stop("EP-B", 0, 0), Stop("EP-A", 2, 0.3)).Graph);

        Assert.Equal(first, again);
        Assert.Equal(first, reversed);
    }

    [Fact]
    public void No_edge_is_an_error()
    {
        var result = Build([], Stop("EP-A", 0, 0));

        Assert.Equal([RouteGraphBuilder.GraphEmpty], ErrorCodes(result));
        Assert.Empty(result.Graph.Edges);
    }

    [Fact]
    public void Writer_emits_the_nav2_route_geojson_layout()
    {
        var result = Build([Lane("E-1", OneWay, (0.123456, -0.00001), (1, 0))], Stop("EP-A", 1, 0));

        using var json = JsonDocument.Parse(RouteGraphGeoJsonWriter.Write(result.Graph));
        var root = json.RootElement;
        Assert.Equal("FeatureCollection", root.GetProperty("type").GetString());
        Assert.Equal("MAP-TEST", root.GetProperty("name").GetString());
        var features = root.GetProperty("features").EnumerateArray().ToList();
        var points = features.Where(f => f.GetProperty("geometry").GetProperty("type").GetString() == "Point").ToList();
        var lines = features.Where(f => f.GetProperty("geometry").GetProperty("type").GetString() == "MultiLineString").ToList();
        Assert.Equal(2, points.Count);
        Assert.All(points, p => Assert.Equal("map", p.GetProperty("properties").GetProperty("frame").GetString()));
        var first = points[0].GetProperty("geometry").GetProperty("coordinates");
        Assert.Equal(0.1235, first[0].GetDouble());                  // 4 decimals
        Assert.Equal("0", first[1].GetRawText());                    // no "-0"
        var line = Assert.Single(lines);
        Assert.Equal(2, line.GetProperty("geometry").GetProperty("coordinates")[0].GetArrayLength());
        var ids = features.Select(f => f.GetProperty("properties").GetProperty("id").GetInt32()).ToList();
        Assert.Equal(ids.Count, ids.Distinct().Count());             // node and edge ids never collide
        Assert.Equal(1, line.GetProperty("properties").GetProperty("startid").GetInt32());
    }

    // ------------------------------------------------------------------ zones

    private static RouteGraphZoneInput Zone(string code, ZoneType type, double x0, double y0, double x1, double y1, double? maxSpeed = null) =>
        new(code, type, [new(x0, y0), new(x1, y0), new(x1, y1), new(x0, y1), new(x0, y0)], maxSpeed, true);

    private static RouteGraphResult BuildWithZones(
        IEnumerable<RouteGraphEdgeInput> edges, IEnumerable<RouteGraphZoneInput> zones, params RouteGraphEndpointInput[] endpoints) =>
        RouteGraphBuilder.Build(new RouteGraphInput("MAP-TEST", "map", edges.ToList(), endpoints, zones.ToList()));

    [Fact]
    public void Keep_out_zone_across_a_lane_removes_the_part_inside_and_reports_it()
    {
        var result = BuildWithZones(
            [Lane("E-1", Both, (0, 0), (4, 0))],
            [Zone("Z-SHELF", ZoneType.KEEP_OUT, 1.5, -0.5, 2.5, 0.5)],
            Stop("EP-A", 0, 0), Stop("EP-B", 4, 0));

        Assert.False(HasEdge(result.Graph, (0, 0), (4, 0)));
        Assert.True(HasEdge(result.Graph, (0, 0), (1.5, 0)));        // lane split at the zone boundary
        Assert.True(HasEdge(result.Graph, (2.5, 0), (4, 0)));
        Assert.DoesNotContain(result.Graph.Edges, e =>
            result.Graph.Nodes.Single(n => n.Id == e.StartId).X is > 1.5 and < 2.5);
        var warning = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.LaneInKeepOut);
        Assert.Equal(["Z-SHELF", "E-1"], warning.RelatedCodes);
        Assert.Contains(result.Issues, i => i.Code == RouteGraphBuilder.EndpointUnreachable);   // the only lane is cut
    }

    [Fact]
    public void Keep_out_zone_beside_a_lane_changes_nothing()
    {
        var plain = Build([Lane("E-1", Both, (0, 0), (4, 0))], Stop("EP-A", 0, 0), Stop("EP-B", 4, 0));
        var withZone = BuildWithZones(
            [Lane("E-1", Both, (0, 0), (4, 0))],
            [Zone("Z-SHELF", ZoneType.KEEP_OUT, 1.0, 0.0, 3.0, 1.0)],    // its south edge runs along the lane
            Stop("EP-A", 0, 0), Stop("EP-B", 4, 0));

        Assert.Equal(RouteGraphGeoJsonWriter.Write(plain.Graph), RouteGraphGeoJsonWriter.Write(withZone.Graph));
        Assert.Empty(withZone.Issues);
    }

    [Fact]
    public void Endpoint_inside_a_keep_out_zone_is_an_error()
    {
        var result = BuildWithZones(
            [Lane("E-1", Both, (0, 0), (4, 0))],
            [Zone("Z-SHELF", ZoneType.KEEP_OUT, 1.0, 0.2, 3.0, 1.0)],
            Stop("EP-IN-SHELF", 2.0, 0.4));

        var issue = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.EndpointInKeepOut);
        Assert.Equal(RouteGraphIssueSeverity.Error, issue.Severity);
        Assert.Equal(["EP-IN-SHELF", "Z-SHELF"], issue.RelatedCodes);
    }

    [Fact]
    public void Speed_zone_limits_only_the_lane_part_inside_and_keeps_a_lower_edge_limit()
    {
        var fast = Lane("E-FAST", OneWay, (0, 0), (4, 0)) with { MaxSpeed = 0.5 };
        var slow = Lane("E-SLOW", OneWay, (0, 1), (4, 1)) with { MaxSpeed = 0.1 };
        var result = BuildWithZones([fast, slow], [Zone("Z-SPEED", ZoneType.SPEED, 1, -0.5, 3, 1.5, maxSpeed: 0.15)]);

        RouteGraphEdge EdgeOf((double, double) a, (double, double) b) =>
            result.Graph.Edges.Single(e => e.StartId == NodeAt(result.Graph, a.Item1, a.Item2).Id && e.EndId == NodeAt(result.Graph, b.Item1, b.Item2).Id);
        Assert.Equal(0.5, EdgeOf((0, 0), (1, 0)).AbsSpeedLimit);
        Assert.Equal(0.15, EdgeOf((1, 0), (3, 0)).AbsSpeedLimit);    // zone limit inside
        Assert.Equal(["Z-SPEED"], EdgeOf((1, 0), (3, 0)).ZoneCodes);
        Assert.Equal(0.5, EdgeOf((3, 0), (4, 0)).AbsSpeedLimit);
        Assert.Equal(0.1, EdgeOf((1, 1), (3, 1)).AbsSpeedLimit);     // the Edge's own lower limit wins
        Assert.Empty(EdgeOf((0, 0), (1, 0)).ZoneCodes);
    }

    [Fact]
    public void No_stop_and_single_occupancy_zones_only_label_the_segments()
    {
        var result = BuildWithZones(
            [Lane("E-1", Both, (0, 0), (4, 0))],
            [Zone("Z-NOSTOP", ZoneType.NO_STOP, 0.5, -0.5, 1.5, 0.5), Zone("Z-ONE", ZoneType.SINGLE_OCCUPANCY, 2.5, -0.5, 3.5, 0.5)]);

        var noStop = result.Graph.Edges.Where(e => e.NoStop).ToList();
        var single = result.Graph.Edges.Where(e => e.SingleOccupancy).ToList();
        Assert.Equal(2, noStop.Count);                                 // both directions of the piece inside
        Assert.Equal(2, single.Count);
        Assert.All(noStop, e => Assert.Equal(["Z-NOSTOP"], e.ZoneCodes));
        Assert.All(result.Graph.Edges, e => Assert.Null(e.AbsSpeedLimit));
        using var json = JsonDocument.Parse(RouteGraphGeoJsonWriter.Write(result.Graph));
        var labelled = json.RootElement.GetProperty("features").EnumerateArray()
            .Select(f => f.GetProperty("properties"))
            .Where(p => p.TryGetProperty("metadata", out var m) && m.TryGetProperty("single_occupancy", out _))
            .ToList();
        Assert.Equal(2, labelled.Count);
        Assert.All(labelled, p => Assert.Equal("Z-ONE", p.GetProperty("metadata").GetProperty("zone_codes").GetString()));
    }

    [Fact]
    public void Inactive_zones_are_ignored()
    {
        var zone = Zone("Z-OFF", ZoneType.KEEP_OUT, 1, -1, 3, 1) with { IsActive = false };
        var result = BuildWithZones([Lane("E-1", Both, (0, 0), (4, 0))], [zone], Stop("EP-A", 0, 0), Stop("EP-B", 4, 0));

        Assert.Equal(2, result.Graph.Nodes.Count);
        Assert.Empty(result.Issues);
    }

    // ------------------------------------------------------------------ junction zones (SINGLE_OCCUPANCY / NO_STOP)

    private static RouteGraphEdge? EdgeBetween(RouteGraph graph, (double X, double Y) from, (double X, double Y) to) =>
        graph.Edges.SingleOrDefault(e => e.StartId == NodeAt(graph, from.X, from.Y).Id && e.EndId == NodeAt(graph, to.X, to.Y).Id);

    [Fact]
    public void Single_occupancy_zone_links_two_lanes_that_stop_at_it_in_the_lane_direction()
    {
        // The intersection is drawn as a zone only: one westbound lane ends at its east edge, the next starts at its west edge.
        var result = BuildWithZones(
            [Lane("L-EAST", OneWay, (3, 0), (2, 0)), Lane("L-WEST", OneWay, (1, 0), (0, 0))],
            [Zone("Z-CROSS", ZoneType.SINGLE_OCCUPANCY, 1, -0.5, 2, 0.5)],
            Stop("EP-START", 3, 0), Stop("EP-END", 0, 0));

        var link = EdgeBetween(result.Graph, (2, 0), (1, 0));
        Assert.NotNull(link);
        Assert.True(link.IsJunction);
        Assert.True(link.SingleOccupancy);
        Assert.Equal(["Z-CROSS"], link.ZoneCodes);
        Assert.Null(EdgeBetween(result.Graph, (1, 0), (2, 0)));                 // never against the one-way lanes
        Assert.DoesNotContain(result.Issues, i => i.Code == RouteGraphBuilder.DeadEndNode);
        var unreachable = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.EndpointUnreachable);
        Assert.Equal(["EP-END", "EP-START"], unreachable.RelatedCodes);       // only the way back is missing (one-way)
    }

    [Fact]
    public void Four_way_junction_links_every_incoming_lane_to_every_outgoing_lane_only()
    {
        var result = BuildWithZones(
            [
                Lane("IN-N", OneWay, (1.5, 3), (1.5, 2)), Lane("OUT-S", OneWay, (1.5, 1), (1.5, 0)),
                Lane("IN-E", OneWay, (3, 1.5), (2, 1.5)), Lane("OUT-W", OneWay, (1, 1.5), (0, 1.5))
            ],
            [Zone("Z-X", ZoneType.SINGLE_OCCUPANCY, 1, 1, 2, 2)]);

        var links = result.Graph.Edges.Where(e => e.IsJunction).ToList();
        Assert.Equal(4, links.Count);                                           // N→S, N→W, E→S, E→W
        Assert.NotNull(EdgeBetween(result.Graph, (1.5, 2), (1.5, 1)));
        Assert.NotNull(EdgeBetween(result.Graph, (1.5, 2), (1, 1.5)));
        Assert.NotNull(EdgeBetween(result.Graph, (2, 1.5), (1.5, 1)));
        Assert.NotNull(EdgeBetween(result.Graph, (2, 1.5), (1, 1.5)));
        Assert.Null(EdgeBetween(result.Graph, (1.5, 1), (1.5, 2)));            // no link into an incoming lane
    }

    [Theory]
    [InlineData(0.10, true)]   // hand-drawn lane stopping 10 cm before the zone edge still reaches it
    [InlineData(0.30, false)]  // 30 cm short: not part of the junction
    public void Lane_end_just_outside_the_junction_still_counts(double gap, bool linked)
    {
        var result = BuildWithZones(
            [Lane("L-IN", OneWay, (3, 0), (2 + gap, 0)), Lane("L-OUT", OneWay, (1 - gap, 0), (0, 0))],
            [Zone("Z-CROSS", ZoneType.NO_STOP, 1, -0.5, 2, 0.5)]);

        Assert.Equal(linked, EdgeBetween(result.Graph, (2 + gap, 0), (1 - gap, 0)) is { IsJunction: true, NoStop: true });
    }

    [Fact]
    public void Links_never_leave_an_l_shaped_junction()
    {
        // L-shaped zone: bottom arm x 0..3 / y 0..1, left arm x 0..1 / y 0..3. The straight line from the top of the left
        // arm to the end of the bottom arm cuts the missing corner, so only the links inside the L exist.
        var zone = new RouteGraphZoneInput("Z-L", ZoneType.SINGLE_OCCUPANCY,
            [new(0, 0), new(3, 0), new(3, 1), new(1, 1), new(1, 3), new(0, 3), new(0, 0)], null, true);
        var result = BuildWithZones(
            [Lane("IN-TOP", OneWay, (0.5, 4), (0.5, 3)), Lane("OUT-RIGHT", OneWay, (3, 0.5), (4, 0.5)),
             Lane("OUT-BOTTOM", OneWay, (0.5, 0), (0.5, -1))],
            [zone]);

        Assert.Null(EdgeBetween(result.Graph, (0.5, 3), (3, 0.5)));            // would leave the L
        Assert.NotNull(EdgeBetween(result.Graph, (0.5, 3), (0.5, 0)));         // straight down the left arm
    }

    [Fact]
    public void A_keep_out_zone_inside_the_junction_blocks_the_link()
    {
        var result = BuildWithZones(
            [Lane("L-IN", OneWay, (3, 0), (2, 0)), Lane("L-OUT", OneWay, (1, 0), (0, 0))],
            [Zone("Z-CROSS", ZoneType.SINGLE_OCCUPANCY, 1, -0.5, 2, 0.5), Zone("Z-PILLAR", ZoneType.KEEP_OUT, 1.4, -0.1, 1.6, 0.1)]);

        Assert.DoesNotContain(result.Graph.Edges, e => e.IsJunction);
    }

    [Fact]
    public void Overlapping_no_stop_and_single_occupancy_zones_give_one_link_with_both_labels()
    {
        var result = BuildWithZones(
            [Lane("L-IN", OneWay, (3, 0), (2, 0)), Lane("L-OUT", OneWay, (1, 0), (0, 0))],
            [Zone("Z-ONE", ZoneType.SINGLE_OCCUPANCY, 1, -0.5, 2, 0.5), Zone("Z-NOSTOP", ZoneType.NO_STOP, 0.95, -0.55, 2.05, 0.55)]);

        var link = Assert.Single(result.Graph.Edges, e => e.IsJunction);
        Assert.True(link.SingleOccupancy);
        Assert.True(link.NoStop);
        Assert.Equal(["Z-NOSTOP", "Z-ONE"], link.ZoneCodes);
        using var json = JsonDocument.Parse(RouteGraphGeoJsonWriter.Write(result.Graph));
        Assert.Contains(json.RootElement.GetProperty("features").EnumerateArray(),
            f => f.GetProperty("properties").GetProperty("metadata").TryGetProperty("junction", out var j) && j.GetBoolean());
    }

    // ------------------------------------------------------------------ JUNCTION zones and Endpoints reached through a junction

    [Fact]
    public void Junction_zone_links_the_lanes_without_no_stop_or_single_occupancy_labels()
    {
        var result = BuildWithZones(
            [Lane("L-IN", OneWay, (3, 0), (2, 0)), Lane("L-OUT", OneWay, (1, 0), (0, 0))],
            [Zone("Z-J", ZoneType.JUNCTION, 1, -0.5, 2, 0.5)]);

        var link = EdgeBetween(result.Graph, (2, 0), (1, 0));
        Assert.NotNull(link);
        Assert.True(link.IsJunction);
        Assert.False(link.NoStop);
        Assert.False(link.SingleOccupancy);
        Assert.Equal(["Z-J"], link.ZoneCodes);
        Assert.Null(EdgeBetween(result.Graph, (1, 0), (2, 0)));
    }

    [Fact]
    public void A_speed_zone_over_a_junction_limits_the_link_too()
    {
        var result = BuildWithZones(
            [Lane("L-IN", OneWay, (3, 0), (2, 0)), Lane("L-OUT", OneWay, (1, 0), (0, 0))],
            [Zone("Z-J", ZoneType.JUNCTION, 1, -0.5, 2, 0.5), Zone("Z-SLOW", ZoneType.SPEED, 0.9, -0.6, 2.1, 0.6, maxSpeed: 0.2)]);

        var link = Assert.Single(result.Graph.Edges, e => e.IsJunction);
        Assert.Equal(0.2, link.AbsSpeedLimit);
        Assert.Equal(["Z-J", "Z-SLOW"], link.ZoneCodes);
    }

    [Fact]
    public void Endpoint_beside_a_junction_zone_is_an_error_without_synthetic_spur()
    {
        // EP-IN is outside the junction: no exit-point connector (would invent a two-way spur).
        var result = BuildWithZones(
            [Lane("L-A", Both, (0, 0), (1, 0)), Lane("L-B", Both, (2, 0), (3, 0))],
            [Zone("Z-J", ZoneType.JUNCTION, 1, -0.5, 2, 0.5)],
            Stop("EP-A", 0, 0), Stop("EP-B", 3, 0), Stop("EP-IN", 1.5, -0.8));

        Assert.Contains(result.Issues, i => i.Code == RouteGraphBuilder.EndpointTooFar && i.RelatedCodes.Contains("EP-IN"));
        Assert.DoesNotContain(result.Graph.Edges, e => e.IsConnector);
        Assert.True(EdgeBetween(result.Graph, (1, 0), (2, 0)) is { IsJunction: true }); // lanes still linked
    }

    [Fact]
    public void Endpoint_inside_a_junction_zone_becomes_a_junction_node()
    {
        var result = BuildWithZones(
            [Lane("L-A", Both, (0, 0), (1, 0)), Lane("L-B", Both, (2, 0), (3, 0))],
            [Zone("Z-J", ZoneType.SINGLE_OCCUPANCY, 1, -0.5, 2, 1.0)],
            Stop("EP-A", 0, 0), Stop("EP-B", 3, 0), Stop("EP-MID", 1.5, 0.7));

        Assert.Empty(result.Issues);
        Assert.Equal(["EP-MID"], NodeAt(result.Graph, 1.5, 0.7).EndpointCodes);
        Assert.True(EdgeBetween(result.Graph, (1, 0), (1.5, 0.7)) is { IsJunction: true, SingleOccupancy: true });
        Assert.True(EdgeBetween(result.Graph, (1.5, 0.7), (2, 0)) is { IsJunction: true });
        Assert.DoesNotContain(result.Graph.Edges, e => e.IsConnector);
    }

    [Fact]
    public void Station_inside_zone_keeps_the_one_way_lane_directions()
    {
        // EP-X inside the zone: arrival → station → departure only (no reverse against ONE_WAY).
        var result = BuildWithZones(
            [Lane("L-IN", OneWay, (3, 0), (2, 0)), Lane("L-OUT", OneWay, (1, 0), (0, 0))],
            [Zone("Z-J", ZoneType.NO_STOP, 1, -0.5, 2, 0.5)],
            Stop("EP-X", 1.5, 0));

        Assert.NotNull(EdgeBetween(result.Graph, (2, 0), (1.5, 0)));
        Assert.NotNull(EdgeBetween(result.Graph, (1.5, 0), (1, 0)));
        Assert.Null(EdgeBetween(result.Graph, (1.5, 0), (2, 0)));
        Assert.Null(EdgeBetween(result.Graph, (1, 0), (1.5, 0)));
        Assert.DoesNotContain(result.Issues, i => i.Code == RouteGraphBuilder.EndpointTooFar);
        Assert.DoesNotContain(result.Graph.Edges, e => e.IsConnector);
    }

    [Theory]
    [InlineData(ZoneType.JUNCTION, 1.5, -1.2)]   // 0.70 m below the junction zone
    [InlineData(ZoneType.SPEED, 1.5, -0.8)]      // close, but a SPEED zone is not a junction
    public void Endpoint_far_from_lanes_and_junction_zones_is_still_too_far(ZoneType type, double x, double y)
    {
        var result = BuildWithZones(
            [Lane("L-A", Both, (0, 0), (1, 0)), Lane("L-B", Both, (2, 0), (3, 0))],
            [Zone("Z", type, 1, -0.5, 2, 0.5, maxSpeed: 0.2)],
            Stop("EP-FAR", x, y));

        var issue = Assert.Single(result.Issues, i => i.Code == RouteGraphBuilder.EndpointTooFar);
        Assert.Equal(["EP-FAR"], issue.RelatedCodes);
    }

    // ------------------------------------------------------------------ demo map v7 (3.50 x 4.55 m)

    /// <summary>Lane centre lines of the demo map v7 drawing (metres, origin = south-west corner).</summary>
    private static List<RouteGraphEdgeInput> MapV7Lanes() =>
    [
        Lane("L-LEFT-UP", OneWay, (0.30, 1.025), (0.30, 3.625)),
        Lane("L-TOP-EAST", OneWay, (0.30, 3.625), (2.45, 3.625)),
        Lane("L-EASTCOL-DOWN", OneWay, (2.45, 3.625), (2.45, 2.55)),
        Lane("L-EASTCOL-UP", OneWay, (3.15, 2.55), (3.15, 3.625)),
        Lane("L-CORRIDOR-UPPER", OneWay, (0.30, 2.775), (2.80, 2.775)),
        Lane("L-CORRIDOR-LOWER", OneWay, (2.80, 2.325), (0.30, 2.325)),
        Lane("X-ROBOT-WE", Both, (2.45, 2.55), (2.80, 2.55), (3.15, 2.55)),
        Lane("X-ROBOT-NS", Both, (2.80, 2.775), (2.80, 2.55), (2.80, 2.325)),
        Lane("L-OUT-DOWN", OneWay, (2.725, 2.10), (2.725, 1.025)),
        Lane("L-BOTTOM-WEST", OneWay, (2.725, 1.025), (0.30, 1.025))
    ];

    private static RouteGraphEndpointInput[] MapV7Stops() =>
    [
        Stop("EP-CHG-01", 0.75, 4.18), Stop("EP-PARK-01", 2.45, 4.22), Stop("EP-PARK-02", 3.15, 4.22),
        Stop("EP-S01", 1.45, 2.775), Stop("EP-S02", 1.45, 2.325), Stop("EP-S03", 1.45, 1.025),
        Stop("EP-IN", 0.32, 0.40), Stop("EP-OUT", 0.95, 0.40), Stop("EP-QC", 2.20, 0.40)
    ];

    [Fact]
    public void Map_v7_as_drawn_reports_what_the_map_editor_must_fix()
    {
        var result = Build(MapV7Lanes(), MapV7Stops());

        // Bay / dock stops are 0.55–0.63 m from the nearest lane (limit 0.5 m).
        var tooFar = result.Issues.Where(i => i.Code == RouteGraphBuilder.EndpointTooFar).SelectMany(i => i.RelatedCodes).Order().ToList();
        Assert.Equal(["EP-CHG-01", "EP-IN", "EP-OUT", "EP-PARK-01", "EP-PARK-02", "EP-QC"], tooFar);
        // The exit lane (2.725, 2.10)↓ is not joined to the 1-robot junction: nothing leads to the bottom lane / EP-S03.
        Assert.Contains(result.Issues, i => i.Code == RouteGraphBuilder.EndpointUnreachable && i.RelatedCodes.Contains("EP-S03"));
        // The east column ends at (3.15, 3.625) with no way on.
        Assert.Contains(result.Issues, i => i.Code == RouteGraphBuilder.DeadEndNode && i.RelatedCodes.Contains("L-EASTCOL-UP"));
        // Stops lying on lanes become nodes directly.
        Assert.Equal(["EP-S01"], NodeAt(result.Graph, 1.45, 2.775).EndpointCodes);
        Assert.Equal(["EP-S03"], NodeAt(result.Graph, 1.45, 1.025).EndpointCodes);
    }

    [Fact]
    public void Map_v7_with_bay_spurs_and_the_exit_link_has_no_error()
    {
        // SUPPLEMENTARY edges (not in the drawing): spurs into the bays / docks and the missing links.
        List<RouteGraphEdgeInput> lanes =
        [
            .. MapV7Lanes(),
            Lane("ADD-CHG-BAY", Both, (0.75, 3.625), (0.75, 4.18)),
            Lane("ADD-PARK-01-BAY", Both, (2.45, 3.625), (2.45, 4.22)),
            Lane("ADD-PARK-02-BAY", Both, (3.15, 3.625), (3.15, 4.22)),
            Lane("ADD-EASTCOL-TO-TOP", OneWay, (3.15, 3.625), (2.45, 3.625)),
            Lane("ADD-JUNCTION-TO-EXIT", OneWay, (2.80, 2.325), (2.725, 2.10)),
            Lane("ADD-IN-DOCK", Both, (0.32, 1.025), (0.32, 0.40)),
            Lane("ADD-OUT-DOCK", Both, (0.95, 1.025), (0.95, 0.40)),
            Lane("ADD-QC-DOCK", Both, (2.20, 1.025), (2.20, 0.40))
        ];

        var result = Build(lanes, MapV7Stops());

        Assert.Empty(ErrorCodes(result));
        Assert.Empty(result.Issues);
        Assert.Equal(9, result.Graph.Nodes.Count(n => n.EndpointCodes.Count > 0));
        Assert.DoesNotContain(result.Graph.Edges, e => e.IsConnector);  // every stop sits on a lane end
    }
}
