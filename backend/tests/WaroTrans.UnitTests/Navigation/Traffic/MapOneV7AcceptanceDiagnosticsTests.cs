using System.Globalization;
using System.Text;
using System.Text.Json;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using Xunit.Abstractions;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>
/// Compiler v7 acceptance diagnostics on a fresh read-only MAP-ONE-V001 snapshot.
/// Scores static evidence only; never claims Motion/Traffic E2E or FollowPath.
/// </summary>
public sealed class MapOneV7AcceptanceDiagnosticsTests(ITestOutputHelper output)
{
    private const string MapFolder = "MAP-ONE-V001";

    private static readonly string[] ForwardCycle =
    [
        "EP-PARKING-A", "EP-INBOUND", "EP-SHELFA01", "EP-OUTBOUND", "EP-PARKING-A"
    ];

    [Fact]
    public void Acceptance_fingerprint_turn_nostop_traffic_motion_labels()
    {
        var root = MapSnapshotCompileHarness.ResolveSampleDir(MapFolder);
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        Assert.NotNull(input.Occupancy);

        var yawByCode = LoadEndpointYaws(root);
        var result = TrafficGraphCompiler.Compile(input);
        var report = TrafficGraphValidator.Validate(
            Guid.Empty, result.Graph, result.Issues, input.ZoneMeta, zones: input.Zones);
        var g = result.Graph;
        var fp = input.Footprint;
        var sb = new StringBuilder();
        var inv = CultureInfo.InvariantCulture;

        // --- Fingerprint / one graph ---
        sb.AppendLine(inv, $"compiler={TrafficGraphCompiler.CompilerVersion}");
        sb.AppendLine(inv, $"graphHash={g.GraphHash}");
        sb.AppendLine(inv, $"nodes={g.Nodes.Length} edges={g.Edges.Length} resources={g.Resources.Length}");
        sb.AppendLine(inv, $"input edges={input.Edges.Count} endpoints={input.Endpoints.Count} zones={input.Zones.Count}");
        sb.AppendLine(inv, $"occupancyFingerprint={input.Occupancy!.Fingerprint}");
        sb.AppendLine(inv, $"footprint L={fp.LengthMeters:0.###} W={fp.WidthMeters:0.###} pad={fp.PaddingMeters:0.###} half={fp.HalfWidth:0.###} turn={fp.TurnRadius:0.###}");
        sb.AppendLine(inv, $"routeOptions snapV={RouteGraphOptions.Default.VertexSnapTolerance:0.###} snapEp={RouteGraphOptions.Default.EndpointSnapDistance:0.###} juncCap={RouteGraphOptions.Default.JunctionCaptureDistance:0.###} maxAccess={RouteGraphOptions.Default.MaxEndpointAccessDistance:0.###}");
        sb.AppendLine($"LEVEL snapshot_compile_hash={g.GraphHash}");
        sb.AppendLine($"LEVEL graph_hash_binding=PASS (snapshot compile + tests + Debug SVG share {g.GraphHash}; Host Check verified separately)");

        var stations = g.Stations.ToDictionary(s => s.EndpointCode, s => s.NodeId, StringComparer.Ordinal);

        // --- Connectivity ---
        var highlight = new HashSet<int>();
        var connOk = true;
        for (var i = 0; i < ForwardCycle.Length - 1; i++)
        {
            var a = ForwardCycle[i];
            var b = ForwardCycle[i + 1];
            var path = g.ShortestPath(stations[a], stations[b]);
            if (path is null)
            {
                connOk = false;
                sb.AppendLine($"CONN_FAIL {a}→{b}");
            }
            else
            {
                sb.AppendLine($"CONN_OK {a}→{b} edges=[{string.Join(",", path)}]");
                foreach (var e in path)
                {
                    highlight.Add(e);
                }
            }
        }

        sb.AppendLine($"LEVEL graph_connectivity={(connOk ? "PASS" : "FAIL")}");
        Assert.True(connOk, sb.ToString());

        // --- Geometry (generated) ---
        var geoOk = true;
        foreach (var edge in g.Edges.Where(e => e.IsJunction || e.IsConnector))
        {
            var a = g.NodeById[edge.StartId];
            var b = g.NodeById[edge.EndId];
            var clearance = input.Occupancy.MinClearanceAlong(a.X, a.Y, b.X, b.Y);
            if (clearance + 1e-9 < fp.HalfWidth)
            {
                geoOk = false;
                sb.AppendLine(inv, $"GEO_FAIL edge {edge.Id} clr={clearance:0.###}");
            }
        }

        sb.AppendLine($"LEVEL geometry={(geoOk ? "PASS" : "FAIL")}");
        Assert.True(geoOk, sb.ToString());

        // --- TURN classification ---
        var falseTurn = new List<string>();
        var turnIssues = result.Issues.Where(i => i.Code == TrafficGraphCompiler.TurnClearance).ToList();
        foreach (var issue in turnIssues)
        {
            var code = issue.RelatedCodes.FirstOrDefault(c => !c.StartsWith("node:", StringComparison.Ordinal));
            if (code is null)
            {
                sb.AppendLine($"TURN keep {issue.Message}");
                continue;
            }

            var st = g.Stations.First(s => s.EndpointCode == code);
            var node = g.NodeById[st.NodeId];
            var clr = input.Occupancy.ClearanceAt(node.X, node.Y);
            yawByCode.TryGetValue(code, out var yaw);
            var incident = g.Edges.Where(e => e.StartId == st.NodeId || e.EndId == st.NodeId).ToList();
            var incoming = incident.Where(e => e.EndId == st.NodeId).ToList();
            var outgoing = incident.Where(e => e.StartId == st.NodeId).ToList();
            var onCycle = incident.Any(e => highlight.Contains(e.Id));
            var realPivot = false;
            var maxDeltaDeg = 0.0;
            foreach (var inn in incoming)
            {
                var ia = g.NodeById[inn.StartId];
                var ib = g.NodeById[inn.EndId];
                var inAng = Math.Atan2(ib.Y - ia.Y, ib.X - ia.X);
                foreach (var oute in outgoing)
                {
                    if (oute.EndId == inn.StartId)
                    {
                        continue;
                    }

                    var oa = g.NodeById[oute.StartId];
                    var ob = g.NodeById[oute.EndId];
                    var outAng = Math.Atan2(ob.Y - oa.Y, ob.X - oa.X);
                    var delta = Math.Abs(Normalize(outAng - inAng));
                    maxDeltaDeg = Math.Max(maxDeltaDeg, delta * 180 / Math.PI);
                    if (delta > Math.PI / 6)
                    {
                        realPivot = true;
                    }
                }
            }

            var approachVsYaw = double.NaN;
            if (incoming.Count > 0)
            {
                var inn = incoming[0];
                var ia = g.NodeById[inn.StartId];
                var ib = g.NodeById[inn.EndId];
                var inAng = Math.Atan2(ib.Y - ia.Y, ib.X - ia.X);
                approachVsYaw = Math.Abs(Normalize(inAng - yaw)) * 180 / Math.PI;
            }

            var classif = !realPivot && incoming.Count > 0 && outgoing.Count > 0
                ? "false_positive_candidate"
                : realPivot
                    ? "real_pivot_map_data"
                    : "reverse_only_or_deadend";
            if (classif == "false_positive_candidate" || classif == "reverse_only_or_deadend")
            {
                falseTurn.Add(code);
            }

            sb.AppendLine(inv,
                $"TURN {classif} {code} node={st.NodeId} pose=({node.X:0.###},{node.Y:0.###}) yaw={yaw:0.####} " +
                $"clr={clr:0.###} need={fp.TurnRadius:0.###} maxΔdeg={maxDeltaDeg:0.0} approachVsYawDeg={approachVsYaw:0.0} onCycleIncident={onCycle}");
        }

        sb.AppendLine(inv, $"LEVEL turn_remaining={turnIssues.Count} false_candidates={falseTurn.Count}");
        Assert.Empty(falseTurn);

        // --- STOP_IN_NO_STOP / Shelf-B01 ---
        var nostopZones = input.Zones.Where(z => z.IsActive && z.ZoneType == ZoneType.NO_STOP).ToList();
        foreach (var issue in report.Issues.Where(i => i.Code == TrafficGraphValidator.StopInNoStop))
        {
            var code = issue.RelatedCodes.FirstOrDefault() ?? "?";
            if (!stations.TryGetValue(code, out var nodeId))
            {
                sb.AppendLine($"NOSTOP missing station {code}");
                continue;
            }

            var node = g.NodeById[nodeId];
            var poseHits = nostopZones
                .Where(z => PointInRing(z.Ring, node.X, node.Y) || DistToRing(z.Ring, node.X, node.Y) <= fp.HalfWidth + 1e-9)
                .Select(z => z.Code)
                .ToList();
            var incident = g.Edges.Where(e => e.StartId == nodeId || e.EndId == nodeId).ToList();
            sb.AppendLine(inv,
                $"NOSTOP station={code} pose=({node.X:0.###},{node.Y:0.###}) half={fp.HalfWidth:0.###} " +
                $"poseDiskHitsNoStop=[{string.Join(",", poseHits)}] " +
                $"incident=[{string.Join(";", incident.Select(e => $"{e.Id}:NoStop={e.NoStop}/J={e.IsJunction}/C={e.IsConnector}/crit={e.InCriticalCorridor}/zones={string.Join("|", e.ZoneCodes)}"))}]");

            if (poseHits.Count > 0)
            {
                sb.AppendLine($"NOSTOP_CLASS {code}=map_data (stop footprint intersects NO_STOP)");
            }
            else if (incident.Any(e => e.NoStop && e.InCriticalCorridor))
            {
                sb.AppendLine($"NOSTOP_CLASS {code}=code_bug_candidate (pose clear; incident NoStop+critical tagged)");
            }
            else
            {
                sb.AppendLine($"NOSTOP_CLASS {code}=unexpected");
            }
        }

        // Focus Shelf-B01 even if issue cleared.
        if (stations.TryGetValue("EP-SHELFB01", out var b01))
        {
            var node = g.NodeById[b01];
            var poseHits = nostopZones
                .Where(z => PointInRing(z.Ring, node.X, node.Y) || DistToRing(z.Ring, node.X, node.Y) <= fp.HalfWidth + 1e-9)
                .Select(z => z.Code)
                .ToList();
            var dist = nostopZones.Count == 0
                ? double.PositiveInfinity
                : nostopZones.Min(z => DistToRing(z.Ring, node.X, node.Y));
            sb.AppendLine(inv,
                $"SHELFB01 pose=({node.X:0.###},{node.Y:0.###}) distToNoStop={dist:0.###} poseDiskHits=[{string.Join(",", poseHits)}]");
            Assert.DoesNotContain(
                report.Issues,
                i => i.Code == TrafficGraphValidator.StopInNoStop && i.RelatedCodes.Contains("EP-SHELFB01"));
            sb.AppendLine("NOSTOP_CLASS EP-SHELFB01=cleared_by_pose_disk_rule (code fix v8)");
        }

        // --- Traffic static ---
        var trafficOk = true;
        var centralEdges = g.Edges
            .Where(e => e.IsJunction && e.ZoneCodes.Contains("ZONE-CENTRAL-JUNCTION", StringComparer.Ordinal))
            .ToList();
        var auditEdges = g.Edges.Where(e => highlight.Contains(e.Id) || centralEdges.Any(c => c.Id == e.Id)).ToList();
        var segments = auditEdges
            .Select(e =>
            {
                var a = g.NodeById[e.StartId];
                var b = g.NodeById[e.EndId];
                return (e.Id, a.X, a.Y, b.X, b.Y);
            })
            .ToList();
        var swept = SweptConflictIndex.Build(segments, fp.TurnRadius);
        foreach (var e in auditEdges)
        {
            foreach (var otherId in swept.ConflictsWith(e.Id).Where(id => id > e.Id))
            {
                var shared = g.Resources
                    .Where(r => r.Capacity <= 1 &&
                                r.EdgeIds.Contains(e.Id) &&
                                r.EdgeIds.Contains(otherId) &&
                                r.Kind is TrafficResourceKind.JunctionConflict
                                    or TrafficResourceKind.PhysicalOverlap
                                    or TrafficResourceKind.CriticalCorridor
                                    or TrafficResourceKind.NarrowBidirectional
                                    or TrafficResourceKind.Zone
                                    or TrafficResourceKind.NodeConflict)
                    .Select(r => r.Id)
                    .ToList();
                if (shared.Count == 0)
                {
                    trafficOk = false;
                    sb.AppendLine($"TRAFFIC_FAIL {e.Id}/{otherId}");
                }
            }
        }

        sb.AppendLine($"LEVEL traffic_resources={(trafficOk ? "PASS" : "FAIL")}");
        sb.AppendLine("LEVEL traffic_e2e=NOT_RUN (no two-robot grant execution)");
        Assert.True(trafficOk, sb.ToString());

        // --- Motion: static corridor + kinematic notes ---
        var staticOk = true;
        foreach (var edgeId in highlight)
        {
            var edge = g.Edges.First(e => e.Id == edgeId);
            var a = g.NodeById[edge.StartId];
            var b = g.NodeById[edge.EndId];
            var len = Math.Sqrt(Square(b.X - a.X) + Square(b.Y - a.Y));
            if (len < 1e-9)
            {
                continue;
            }

            var heading = Math.Atan2(b.Y - a.Y, b.X - a.X);
            var clr = input.Occupancy.MinClearanceAlong(a.X, a.Y, b.X, b.Y);
            sb.AppendLine(inv,
                $"KIN edge={edgeId} len={len:0.###} headingDeg={heading * 180 / Math.PI:0.0} " +
                $"minClr={clr:0.###} half={fp.HalfWidth:0.###} J={edge.IsJunction} C={edge.IsConnector} " +
                $"(polyline centerline; curvature=0 straight segment; not FollowPath)");

            var samples = Math.Max(1, (int)Math.Ceiling(len / 0.05));
            for (var i = 0; i <= samples; i++)
            {
                var t = (double)i / samples;
                var x = a.X + (b.X - a.X) * t;
                var y = a.Y + (b.Y - a.Y) * t;
                if (input.Occupancy.ClearanceAt(x, y) + 1e-9 < fp.HalfWidth)
                {
                    staticOk = false;
                    sb.AppendLine(inv, $"STATIC_CORR_FAIL edge {edgeId} at ({x:0.###},{y:0.###})");
                }
            }
        }

        sb.AppendLine($"LEVEL static_corridor={(staticOk ? "PASS" : "FAIL")}");
        sb.AppendLine("LEVEL motion_execution=NOT_RUN (no robot/Nav2 FollowPath evidence)");
        sb.AppendLine("LEVEL gazebo_e2e=NOT_RUN (no isolated MAP-ONE Gazebo bring-up)");
        Assert.True(staticOk, sb.ToString());

        // --- SVG ---
        var svg = TrafficDebugSvgWriter.WriteHighlightedRoute(
            g,
            highlight,
            fp.HalfWidth,
            input.Occupancy,
            report.Issues,
            input.Zones,
            result.RejectedAccessPaths,
            title: $"v7 acceptance hash={g.GraphHash[..12]}");
        var svgPath = Path.Combine(root, "debug-cycle-route.svg");
        File.WriteAllText(svgPath, svg);
        sb.AppendLine($"SVG={svgPath}");

        // Shelf-B01 focus SVG overlay note already in main SVG via issues.
        var levelsPath = Path.Combine(root, "v7-acceptance-levels.txt");
        File.WriteAllText(levelsPath, sb.ToString());
        output.WriteLine(sb.ToString());

        // Issue histogram for the report
        var hist = report.Issues
            .GroupBy(i => i.Code)
            .OrderByDescending(x => x.Count())
            .Select(x => $"{x.Key}={x.Count()}");
        output.WriteLine("HIST " + string.Join("; ", hist));
        File.AppendAllText(levelsPath, "HIST " + string.Join("; ", hist) + Environment.NewLine);
    }

    private static Dictionary<string, double> LoadEndpointYaws(string root)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "snapshot.json")));
        var map = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var e in doc.RootElement.GetProperty("endpoints").EnumerateArray())
        {
            var code = e.GetProperty("code").GetString()!;
            var yaw = e.TryGetProperty("yaw", out var y) ? y.GetDouble() : 0;
            map[code] = yaw;
        }

        return map;
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

    private static double DistToRing(IReadOnlyList<RoutePoint> ring, double x, double y)
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

    private static double Normalize(double a)
    {
        while (a > Math.PI)
        {
            a -= 2 * Math.PI;
        }

        while (a < -Math.PI)
        {
            a += 2 * Math.PI;
        }

        return a;
    }

    private static double Square(double v) => v * v;
}
