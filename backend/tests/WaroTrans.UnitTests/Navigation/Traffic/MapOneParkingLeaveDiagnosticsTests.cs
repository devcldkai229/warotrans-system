using System.Text;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using Xunit.Abstractions;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>Read-only diagnostics for MAP-ONE-V001 parking leave after Junction replace.</summary>
public sealed class MapOneParkingLeaveDiagnosticsTests(ITestOutputHelper output)
{
    private const string MapFolder = "MAP-ONE-V001";

    [Fact]
    public void Dump_parking_leave_topology_and_clearance()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        Assert.NotNull(input.Occupancy);
        var result = TrafficGraphCompiler.Compile(input);
        var report = TrafficGraphValidator.Validate(
            Guid.Empty, result.Graph, result.Issues, input.ZoneMeta, zones: input.Zones);
        var g = result.Graph;
        var sb = new StringBuilder();

        sb.AppendLine($"nodes={g.Nodes.Length} edges={g.Edges.Length} hash={g.GraphHash}");
        sb.AppendLine($"compiler={TrafficGraphCompiler.CompilerVersion}");
        sb.AppendLine($"issues={report.Issues.Count} errors={report.Issues.Count(i => i.Severity == TrafficIssueSeverity.Error)}");
        sb.AppendLine(string.Join("; ", report.Issues.GroupBy(i => i.Code).OrderByDescending(x => x.Count())
            .Select(x => $"{x.Key}={x.Count()}")));

        foreach (var z in input.Zones.Where(z => z.ZoneType == ZoneType.JUNCTION).OrderBy(z => z.Code))
        {
            var xs = z.Ring.Select(p => p.X).ToList();
            var ys = z.Ring.Select(p => p.Y).ToList();
            sb.AppendLine($"JUNCTION {z.Code} bbox=[{xs.Min():0.###}..{xs.Max():0.###},{ys.Min():0.###}..{ys.Max():0.###}]");
        }

        string[] codes = ["EP-PARKING-A", "EP-PARKING-B", "EP-CHARGING-A", "EP-INBOUND", "EP-OUTBOUND", "EP-SHELF-A-01"];
        var stations = g.Stations.ToDictionary(s => s.EndpointCode, s => s, StringComparer.Ordinal);
        foreach (var code in codes.Where(stations.ContainsKey))
        {
            var st = stations[code];
            var n = g.NodeById[st.NodeId];
            sb.AppendLine($"STATION {code} node={st.NodeId} at ({n.X:0.###},{n.Y:0.###}) access={st.AccessEdgeId}");
            foreach (var e in g.Edges.Where(e => e.StartId == st.NodeId || e.EndId == st.NodeId))
            {
                var other = e.StartId == st.NodeId ? e.EndId : e.StartId;
                var on = g.NodeById[other];
                sb.AppendLine(
                    $"  edge {e.Id} {(e.StartId == st.NodeId ? "OUT" : "IN")} other={other} ({on.X:0.###},{on.Y:0.###}) " +
                    $"conn={e.IsConnector} junc={e.IsJunction} zones={string.Join(",", e.ZoneCodes)}");
            }
        }

        foreach (var a in codes.Where(stations.ContainsKey))
        {
            foreach (var b in codes.Where(stations.ContainsKey))
            {
                if (a == b)
                {
                    continue;
                }

                var ok = g.CanReach(stations[a].NodeId, stations[b].NodeId);
                sb.AppendLine($"REACH {a}→{b}: {(ok ? "OK" : "FAIL")}");
            }
        }

        foreach (var issue in report.Issues
                     .Where(i => i.Code is TrafficGraphValidator.OneWayTrap
                         or RouteGraphBuilder.DeadEndNode
                         or TrafficGraphCompiler.InsufficientClearance
                         or TrafficGraphCompiler.TurnClearance
                         or TrafficGraphCompiler.JunctionTransitionBlocked
                         or TrafficGraphCompiler.ServiceAccessBlocked)
                     .OrderBy(i => i.Code))
        {
            sb.AppendLine($"ISSUE [{issue.Severity}] {issue.Code}: {issue.Message} | {string.Join(",", issue.RelatedCodes)}");
        }

        foreach (var n in g.Nodes.Where(n => Math.Abs(n.X + 2.208) < 0.05 && Math.Abs(n.Y - 0.067) < 0.05))
        {
            sb.AppendLine($"NODE_NEAR_5 id={n.Id} ({n.X:0.###},{n.Y:0.###}) holding={n.IsHoldingPoint} station={n.IsStation}");
            foreach (var e in g.Edges.Where(e => e.StartId == n.Id || e.EndId == n.Id))
            {
                sb.AppendLine(
                    $"  incident {e.Id} {e.StartId}->{e.EndId} conn={e.IsConnector} junc={e.IsJunction} " +
                    $"codes={string.Join(",", e.EdgeCodes)} zones={string.Join(",", e.ZoneCodes)}");
            }
        }

        if (stations.TryGetValue("EP-PARKING-A", out var parkA))
        {
            var p = g.NodeById[parkA.NodeId];
            var half = input.Footprint.HalfWidth;
            for (var y = Math.Min(p.Y, -1.2); y <= -0.50; y += 0.05)
            {
                var c = input.Occupancy!.ClearanceAt(p.X, y);
                sb.AppendLine($"CLR x={p.X:0.###} y={y:0.###} clearance={c:0.###} need={half:0.###} ok={c + 1e-9 >= half}");
            }

            var parkJ = input.Zones.FirstOrDefault(z =>
                z.Code.Contains("PARKING", StringComparison.OrdinalIgnoreCase) && z.ZoneType == ZoneType.JUNCTION);
            var centJ = input.Zones.FirstOrDefault(z =>
                z.Code.Contains("CENTRAL", StringComparison.OrdinalIgnoreCase) && z.ZoneType == ZoneType.JUNCTION);
            var bayJ = input.Zones.FirstOrDefault(z => z.Code == "ZONE-JUNCTION---24");
            if (parkJ is not null && centJ is not null)
            {
                var parkMaxY = parkJ.Ring.Max(r => r.Y);
                var centMinY = centJ.Ring.Min(r => r.Y);
                var midY = (parkMaxY + centMinY) / 2;
                sb.AppendLine(
                    $"ABUT parkMaxY={parkMaxY:0.###} centMinY={centMinY:0.###} gap={Math.Abs(centMinY - parkMaxY):0.###}");
                for (var x = -0.68; x <= 0.30; x += 0.1)
                {
                    var c = input.Occupancy!.ClearanceAt(x, midY);
                    sb.AppendLine($"CLR gap x={x:0.###} y={midY:0.###} clearance={c:0.###} ok={c + 1e-9 >= half}");
                }
            }

            if (bayJ is not null)
            {
                sb.AppendLine(
                    $"BAY24 bbox y=[{bayJ.Ring.Min(r => r.Y):0.###}..{bayJ.Ring.Max(r => r.Y):0.###}] " +
                    $"x=[{bayJ.Ring.Min(r => r.X):0.###}..{bayJ.Ring.Max(r => r.X):0.###}]");
            }
        }

        foreach (var code in new[] { "EP-PARKING-A", "EP-PARKING-B", "EP-CHARGING-A" }.Where(stations.ContainsKey))
        {
            var n = g.NodeById[stations[code].NodeId];
            foreach (var z in input.Zones.Where(z => z.ZoneType == ZoneType.JUNCTION))
            {
                if (PointInRing(z.Ring, n.X, n.Y))
                {
                    sb.AppendLine($"INSIDE {code} in {z.Code}");
                }
            }
        }

        // BFS from Parking A: first 30 reachable nodes + why leave fails
        if (stations.TryGetValue("EP-PARKING-A", out var pa))
        {
            var q = new Queue<int>();
            var prev = new Dictionary<int, (int From, int EdgeId)>();
            q.Enqueue(pa.NodeId);
            prev[pa.NodeId] = (-1, -1);
            while (q.Count > 0)
            {
                var u = q.Dequeue();
                foreach (var e in g.Edges.Where(e => e.StartId == u))
                {
                    if (prev.ContainsKey(e.EndId))
                    {
                        continue;
                    }

                    prev[e.EndId] = (u, e.Id);
                    q.Enqueue(e.EndId);
                }
            }

            sb.AppendLine($"PARKA_REACHABLE_NODES={prev.Count}");
            var parkSet = prev.Keys.ToHashSet();
            foreach (var id in prev.Keys.OrderBy(id => id).Take(40))
            {
                var n = g.NodeById[id];
                var outs = g.Edges.Count(e => e.StartId == id);
                var ins = g.Edges.Count(e => e.EndId == id);
                sb.AppendLine($"  reach node {id} ({n.X:0.###},{n.Y:0.###}) in={ins} out={outs} ep={string.Join(",", n.EndpointCodes)}");
            }

            // Edges leaving the Parking-A component (should be empty if sink)
            foreach (var e in g.Edges.Where(e => parkSet.Contains(e.StartId) && !parkSet.Contains(e.EndId)))
            {
                var a = g.NodeById[e.StartId];
                var b = g.NodeById[e.EndId];
                sb.AppendLine(
                    $"LEAVE_EDGE {e.Id} {e.StartId}->({e.EndId}) ({a.X:0.###},{a.Y:0.###})->({b.X:0.###},{b.Y:0.###}) " +
                    $"conn={e.IsConnector} junc={e.IsJunction} zones={string.Join(",", e.ZoneCodes)}");
            }

            foreach (var e in g.Edges.Where(e => !parkSet.Contains(e.StartId) && parkSet.Contains(e.EndId)))
            {
                var a = g.NodeById[e.StartId];
                var b = g.NodeById[e.EndId];
                sb.AppendLine(
                    $"ENTER_EDGE {e.Id} {e.StartId}->({e.EndId}) ({a.X:0.###},{a.Y:0.###})->({b.X:0.###},{b.Y:0.###}) " +
                    $"conn={e.IsConnector} junc={e.IsJunction} zones={string.Join(",", e.ZoneCodes)} codes={string.Join(",", e.EdgeCodes)}");
            }

            // Rejected junction transitions / access
            if (result.RejectedAccessPaths is not null)
            {
                foreach (var r in result.RejectedAccessPaths)
                {
                    sb.AppendLine($"REJ_ACCESS {r.EndpointCode} {r.Reason} ({r.FootX:0.###},{r.FootY:0.###})->({r.GoalX:0.###},{r.GoalY:0.###})");
                }
            }

            // Trace node 17 neighbourhood
            foreach (var id in new[] { 17, 20, 5, pa.NodeId })
            {
                if (!g.NodeById.ContainsKey(id))
                {
                    continue;
                }

                sb.AppendLine($"NEIGHBORHOOD node {id}:");
                foreach (var e in g.Edges.Where(e => e.StartId == id || e.EndId == id))
                {
                    sb.AppendLine(
                        $"  {e.StartId}->{e.EndId} id={e.Id} conn={e.IsConnector} junc={e.IsJunction} " +
                        $"codes={string.Join(",", e.EdgeCodes)} zones={string.Join(",", e.ZoneCodes)}");
                }
            }
        }

        // Distance of parking EPs to junctions
        foreach (var code in new[] { "EP-PARKING-A", "EP-PARKING-B", "EP-CHARGING-A" }.Where(stations.ContainsKey))
        {
            var n = g.NodeById[stations[code].NodeId];
            foreach (var z in input.Zones.Where(z => z.ZoneType == ZoneType.JUNCTION))
            {
                var d = DistanceToRing(z.Ring, n.X, n.Y);
                var inside = PointInRing(z.Ring, n.X, n.Y);
                if (inside || d <= 0.5)
                {
                    sb.AppendLine($"DIST {code} to {z.Code}: inside={inside} dist={d:0.###}");
                }
            }
        }

        output.WriteLine(sb.ToString());

        // Write debug SVG for inspection
        var svg = TrafficDebugSvgWriter.Write(g, input.Occupancy, report.Issues, input.Zones, result.RejectedAccessPaths);
        var svgPath = Path.Combine(MapSnapshotCompileHarness.ResolveSampleDir(MapFolder), "debug-parking-leave.svg");
        File.WriteAllText(svgPath, svg);
        sb.AppendLine($"SVG={svgPath}");
        output.WriteLine($"SVG written {svgPath}");

        Assert.True(g.Nodes.Length > 0);
    }

    private static double DistanceToRing(IReadOnlyList<RoutePoint> ring, double x, double y)
    {
        var best = double.PositiveInfinity;
        for (var i = 0; i < ring.Count; i++)
        {
            var a = ring[i];
            var b = ring[(i + 1) % ring.Count];
            best = Math.Min(best, DistPointSeg(x, y, a.X, a.Y, b.X, b.Y));
        }

        return best;
    }

    private static double DistPointSeg(double px, double py, double ax, double ay, double bx, double by)
    {
        var abx = bx - ax;
        var aby = by - ay;
        var t = abx * abx + aby * aby;
        if (t < 1e-18)
        {
            return Math.Sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
        }

        var u = Math.Clamp(((px - ax) * abx + (py - ay) * aby) / t, 0, 1);
        var qx = ax + u * abx;
        var qy = ay + u * aby;
        return Math.Sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
    }

    private static bool PointInRing(IReadOnlyList<RoutePoint> ring, double x, double y)
    {
        var inside = false;
        for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
        {
            var xi = ring[i].X;
            var yi = ring[i].Y;
            var xj = ring[j].X;
            var yj = ring[j].Y;
            var intersect = ((yi > y) != (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / (yj - yi + 1e-30) + xi);
            if (intersect)
            {
                inside = !inside;
            }
        }

        return inside;
    }
}
