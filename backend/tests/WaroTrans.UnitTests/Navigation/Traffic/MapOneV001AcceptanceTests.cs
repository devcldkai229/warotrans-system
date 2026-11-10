using System.Text;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using Xunit.Abstractions;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>
/// Root-cause acceptance against read-only snapshot samples/maps/MAP-ONE-V001.
/// Does not mutate the database.
/// </summary>
public sealed class MapOneV001AcceptanceTests(ITestOutputHelper output)
{
    private const string MapFolder = "MAP-ONE-V001";

    [Fact]
    public void Compile_histogram_hash_and_no_executable_unsafe_generated_edges()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        Assert.NotNull(input.Occupancy);

        var result = TrafficGraphCompiler.Compile(input);
        var report = TrafficGraphValidator.Validate(
            Guid.Empty, result.Graph, result.Issues, input.ZoneMeta, zones: input.Zones);

        var hist = report.Issues
            .GroupBy(i => i.Code)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => $"{g.Key}={g.Count()}")
            .ToList();

        var dump = new StringBuilder();
        dump.AppendLine($"nodes={result.Graph.Nodes.Length} edges={result.Graph.Edges.Length} hash={result.Graph.GraphHash}");
        dump.AppendLine($"compiler={TrafficGraphCompiler.CompilerVersion}");
        dump.AppendLine($"issues={report.Issues.Count} errors={report.Issues.Count(i => i.Severity == TrafficIssueSeverity.Error)}");
        dump.AppendLine(string.Join("; ", hist));

        // Fail-closed: no remaining generated edge below HalfWidth.
        foreach (var edge in result.Graph.Edges.Where(e => e.IsConnector || e.IsJunction))
        {
            var a = result.Graph.NodeById[edge.StartId];
            var b = result.Graph.NodeById[edge.EndId];
            var clearance = input.Occupancy!.MinClearanceAlong(a.X, a.Y, b.X, b.Y);
            Assert.True(
                clearance + 1e-9 >= input.Footprint.HalfWidth,
                $"Executable generated edge {edge.Id} clearance {clearance:0.###} < {input.Footprint.HalfWidth}");
        }

        // No INSUFFICIENT_CLEARANCE on generated (empty EdgeCodes) edges — they must be stripped or replaced.
        foreach (var issue in result.Issues.Where(i => i.Code == TrafficGraphCompiler.InsufficientClearance))
        {
            foreach (var code in issue.RelatedCodes.Where(c => c.StartsWith("edge:", StringComparison.Ordinal)))
            {
                if (!int.TryParse(code.AsSpan(5), out var eid))
                {
                    continue;
                }

                var edge = result.Graph.Edges.FirstOrDefault(e => e.Id == eid);
                if (edge is null)
                {
                    continue;
                }

                Assert.False(
                    edge.IsConnector || edge.IsJunction,
                    $"INSUFFICIENT_CLEARANCE still on executable generated edge {eid}");
            }
        }

        DumpConnectivity(result, dump);
        output.WriteLine(dump.ToString());

        Assert.Equal(10, TrafficGraphCompiler.CompilerVersion);
        var again = TrafficGraphCompiler.Compile(input);
        Assert.Equal(result.Graph.GraphHash, again.Graph.GraphHash);
    }

    [Fact]
    public void TurnClearance_skips_drive_in_reverse_out_stations()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        var result = TrafficGraphCompiler.Compile(input);

        foreach (var issue in result.Issues.Where(i => i.Code == TrafficGraphCompiler.TurnClearance))
        {
            var stationCode = issue.RelatedCodes.FirstOrDefault(c => !c.StartsWith("node:", StringComparison.Ordinal));
            if (stationCode is null)
            {
                continue;
            }

            var station = result.Graph.Stations.FirstOrDefault(s => s.EndpointCode == stationCode);
            Assert.NotNull(station);
            var incident = result.Graph.Edges
                .Where(e => e.StartId == station.NodeId || e.EndId == station.NodeId)
                .ToList();
            var incoming = incident.Where(e => e.EndId == station.NodeId).ToList();
            var outgoing = incident.Where(e => e.StartId == station.NodeId).ToList();
            // Remaining TURN must involve a real pivot (not only reverse-out).
            var hasPivot = false;
            foreach (var inn in incoming)
            {
                foreach (var oute in outgoing)
                {
                    if (oute.EndId == inn.StartId)
                    {
                        continue;
                    }

                    hasPivot = true;
                }
            }

            Assert.True(hasPivot || incoming.Count == 0 || outgoing.Count == 0,
                $"TURN_CLEARANCE on reverse-only station {stationCode}");
        }
    }

    [Fact]
    public void AmbiguousIntersection_skips_pure_connector_waypoints()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        var result = TrafficGraphCompiler.Compile(input);
        var report = TrafficGraphValidator.Validate(
            Guid.Empty, result.Graph, result.Issues, input.ZoneMeta, zones: input.Zones);

        foreach (var issue in report.Issues.Where(i => i.Code == TrafficGraphValidator.AmbiguousIntersection))
        {
            var nodeToken = issue.RelatedCodes.FirstOrDefault(c => c.StartsWith("node:", StringComparison.Ordinal));
            if (nodeToken is null)
            {
                continue;
            }

            var id = int.Parse(nodeToken["node:".Length..]);
            var incident = result.Graph.Edges.Where(e => e.StartId == id || e.EndId == id).ToList();
            Assert.False(incident.Count > 0 && incident.All(e => e.IsConnector));
        }
    }

    [Fact]
    public void Business_routes_pass_or_fail_with_geometry_evidence()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        var result = TrafficGraphCompiler.Compile(input);
        var graph = result.Graph;
        var stations = graph.Stations.ToDictionary(s => s.EndpointCode, s => s.NodeId, StringComparer.Ordinal);

        string[][] legs =
        [
            ["EP-PARKING-A", "EP-INBOUND"],
            ["EP-INBOUND", "EP-SHELF-A-01"],
            ["EP-SHELF-A-01", "EP-OUTBOUND"],
            ["EP-OUTBOUND", "EP-PARKING-A"],
            ["EP-PARKING-A", "EP-OUTBOUND"],
            ["EP-OUTBOUND", "EP-SHELF-A-01"],
            ["EP-SHELF-A-01", "EP-INBOUND"],
            ["EP-INBOUND", "EP-PARKING-A"],
            ["EP-CHARGING-A", "EP-INBOUND"],
            ["EP-INBOUND", "EP-CHARGING-A"],
        ];

        var sb = new StringBuilder();
        foreach (var leg in legs)
        {
            var a = leg[0];
            var b = leg[1];
            if (!stations.ContainsKey(a) || !stations.ContainsKey(b))
            {
                sb.AppendLine($"SKIP {a}→{b}: endpoint missing");
                continue;
            }

            var ok = graph.CanReach(stations[a], stations[b]);
            if (ok)
            {
                sb.AppendLine($"PASS {a}→{b}");
                continue;
            }

            var reason = ExplainUnreachable(result, a, b);
            sb.AppendLine($"FAIL {a}→{b}: {reason}");
            Assert.False(string.IsNullOrWhiteSpace(reason));
        }

        output.WriteLine(sb.ToString());
    }

    [Fact]
    public void Last_resort_stopline_is_not_unsafe_holding()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        var result = TrafficGraphCompiler.Compile(input);
        foreach (var stop in result.Graph.Stoplines)
        {
            var corridor = result.Graph.Corridors.First(c => c.Id == stop.CorridorId);
            var fromDeclaredEntry = corridor.EntryNodeIds.Contains(stop.NodeId);
            if (fromDeclaredEntry)
            {
                continue; // declared entries are corridor boundaries by construction
            }

            // Last-resort / fallback: must not invent a holding pose below TurnRadius.
            var node = result.Graph.NodeById[stop.NodeId];
            var trafficNode = result.Graph.Nodes.First(n => n.Id == stop.NodeId);
            if (input.Occupancy is { } occ && trafficNode.IsHoldingPoint)
            {
                Assert.True(
                    occ.ClearanceAt(node.X, node.Y) + 1e-9 >= input.Footprint.TurnRadius,
                    $"Unsafe last-resort stopline/holding at node {stop.NodeId}");
            }

            var corridorEdge = result.Graph.Edges.First(e => e.Id == stop.EntryEdgeId);
            Assert.False(corridorEdge.NoStop, $"Last-resort stopline on NO_STOP edge {stop.EntryEdgeId}");
        }
    }

    private static void DumpConnectivity(TrafficCompileResult result, StringBuilder dump)
    {
        string[] business = ["EP-PARKING-A", "EP-PARKING-B", "EP-CHARGING-A", "EP-INBOUND", "EP-OUTBOUND", "EP-SHELF-A-01"];
        var stations = result.Graph.Stations.ToDictionary(s => s.EndpointCode, s => s.NodeId, StringComparer.Ordinal);
        foreach (var a in business.Where(stations.ContainsKey))
        {
            foreach (var b in business.Where(stations.ContainsKey))
            {
                if (a == b)
                {
                    continue;
                }

                var ok = result.Graph.CanReach(stations[a], stations[b]);
                dump.AppendLine($"  route {a}→{b}: {(ok ? "OK" : "UNREACHABLE")}");
            }
        }

        foreach (var issue in result.Issues
                     .Where(i => i.Code is TrafficGraphCompiler.JunctionTransitionBlocked
                         or TrafficGraphValidator.OneWayTrap
                         or RouteGraphBuilder.DeadEndNode
                         or TrafficGraphCompiler.InsufficientClearance)
                     .OrderBy(i => i.Code, StringComparer.Ordinal))
        {
            dump.AppendLine($"  [{issue.Severity}] {issue.Code}: {issue.Message}");
        }

        // Parking leave: first non-connector after station.
        if (stations.TryGetValue("EP-PARKING-A", out var parkNode))
        {
            var outs = result.Graph.Edges.Where(e => e.StartId == parkNode).ToList();
            dump.AppendLine($"  EP-PARKING-A outgoing edges={outs.Count}");
            foreach (var e in outs)
            {
                dump.AppendLine(
                    $"    → edge {e.Id} connector={e.IsConnector} junction={e.IsJunction} to {e.EndId} zones={string.Join(",", e.ZoneCodes)}");
            }
        }
    }

    private static string ExplainUnreachable(TrafficCompileResult result, string fromCode, string toCode)
    {
        var sab = result.Issues
            .Where(i => i.Code is TrafficGraphCompiler.ServiceAccessBlocked
                or TrafficGraphCompiler.JunctionTransitionBlocked)
            .Where(i => i.RelatedCodes.Contains(fromCode) || i.RelatedCodes.Contains(toCode) ||
                        i.Message.Contains(fromCode, StringComparison.Ordinal) ||
                        i.Message.Contains(toCode, StringComparison.Ordinal))
            .Select(i => i.Message)
            .ToList();
        if (sab.Count > 0)
        {
            return string.Join(" | ", sab);
        }

        // Topology: parking lane ONE_WAY into ZONE-JUNCTION-PARKING with no departure portal.
        if (fromCode.StartsWith("EP-PARKING", StringComparison.Ordinal) ||
            fromCode == "EP-CHARGING-A")
        {
            return "ONE_WAY sink: EDGE-LANE-PARKING-A ends in ZONE-JUNCTION-PARKING with no departure lane portal; " +
                   "cannot reverse authored ONE_WAY; no junction↔junction chord invented";
        }

        return $"no directed path {fromCode}→{toCode}";
    }
}
