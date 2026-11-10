using System.Text;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using Xunit.Abstractions;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>
/// Beyond-CanReach proofs for MAP-ONE-V001 (CompilerVersion 6+). DB read-only snapshot only.
/// Scores: connectivity / geometry / motion / traffic. Gazebo is probed separately (NOT_RUN if absent).
/// </summary>
public sealed class MapOneRouteProofTests(ITestOutputHelper output)
{
    private const string MapFolder = "MAP-ONE-V001";

    private static readonly string[] ForwardCycle =
    [
        "EP-PARKING-A", "EP-INBOUND", "EP-SHELF-A-01", "EP-OUTBOUND", "EP-PARKING-A"
    ];

    private static readonly string[] ReverseCycle =
    [
        "EP-PARKING-A", "EP-OUTBOUND", "EP-SHELF-A-01", "EP-INBOUND", "EP-PARKING-A"
    ];

    [Fact(Skip = MapSnapshotCompileHarness.ActiveRouteGraphNotConnected)]
    public void Route_proof_levels_and_debug_svg()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        Assert.NotNull(input.Occupancy);
        var result = TrafficGraphCompiler.Compile(input);
        var report = TrafficGraphValidator.Validate(
            Guid.Empty, result.Graph, result.Issues, input.ZoneMeta, zones: input.Zones);
        var g = result.Graph;
        var fp = input.Footprint;
        var sb = new StringBuilder();
        sb.AppendLine($"compiler={TrafficGraphCompiler.CompilerVersion} hash={g.GraphHash}");
        sb.AppendLine($"nodes={g.Nodes.Length} edges={g.Edges.Length}");

        var stations = g.Stations.ToDictionary(s => s.EndpointCode, s => s.NodeId, StringComparer.Ordinal);
        foreach (var code in ForwardCycle.Distinct(StringComparer.Ordinal))
        {
            Assert.True(stations.ContainsKey(code), $"missing station {code}");
        }

        // --- Level: graph connectivity ---
        var forwardEdges = CollectCycleEdges(g, stations, ForwardCycle, sb, "FWD");
        var reverseEdges = CollectCycleEdges(g, stations, ReverseCycle, sb, "REV");
        Assert.NotNull(forwardEdges);
        Assert.NotNull(reverseEdges);
        sb.AppendLine("LEVEL graph_connectivity=PASS");

        var highlight = forwardEdges!.Concat(reverseEdges!).ToHashSet();

        // --- Level: geometry (path + all generated edges) ---
        var geoOk = true;
        foreach (var edgeId in highlight)
        {
            var edge = g.Edges.First(e => e.Id == edgeId);
            var a = g.NodeById[edge.StartId];
            var b = g.NodeById[edge.EndId];
            var clearance = input.Occupancy!.MinClearanceAlong(a.X, a.Y, b.X, b.Y);
            if (clearance + 1e-9 < fp.HalfWidth)
            {
                geoOk = false;
                sb.AppendLine($"GEO_FAIL path edge {edgeId} clearance={clearance:0.###} < {fp.HalfWidth:0.###}");
            }
        }

        var authoredOneWay = input.LaneMeta
            .Where(m => m.Direction == EdgeDirection.ONE_WAY)
            .Select(m => m.Code)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var edge in g.Edges.Where(e => e.IsJunction || e.IsConnector))
        {
            var a = g.NodeById[edge.StartId];
            var b = g.NodeById[edge.EndId];
            var clearance = input.Occupancy!.MinClearanceAlong(a.X, a.Y, b.X, b.Y);
            if (clearance + 1e-9 < fp.HalfWidth)
            {
                geoOk = false;
                sb.AppendLine($"GEO_FAIL generated edge {edgeId(edge)} clearance={clearance:0.###}");
            }

            // Generated edge must not be a reverse of an authored ONE_WAY centre-line segment.
            if (edge.EdgeCodes.Any(authoredOneWay.Contains) && edge.IsConnector)
            {
                // connectors normally have empty EdgeCodes; if they carry ONE_WAY codes something is wrong
                geoOk = false;
                sb.AppendLine($"GEO_FAIL connector carries ONE_WAY codes {string.Join(",", edge.EdgeCodes)}");
            }

            var midX = (a.X + b.X) / 2;
            var midY = (a.Y + b.Y) / 2;
            if (edge.IsJunction && !edge.IsConnector)
            {
                var inJunction = input.Zones.Any(z =>
                    z.IsActive && z.ZoneType == ZoneType.JUNCTION && PointInRing(z.Ring, midX, midY));
                if (!inJunction && edge.ZoneCodes.Length == 0)
                {
                    // Allow slight boundary; still require a JUNCTION zone code.
                    geoOk = false;
                    sb.AppendLine($"GEO_FAIL junction edge {edge.Id} midpoint outside JUNCTION ({midX:0.###},{midY:0.###})");
                }
            }
        }

        sb.AppendLine($"LEVEL geometry={(geoOk ? "PASS" : "FAIL")}");
        Assert.True(geoOk, sb.ToString());

        // --- Level: traffic (central crossing chords share capacity-1 resource) ---
        var trafficOk = true;
        var centralEdges = g.Edges
            .Where(e => e.IsJunction &&
                        e.ZoneCodes.Contains("ZONE-CENTRAL-JUNCTION", StringComparer.Ordinal))
            .ToList();
        var segments = centralEdges
            .Select(e =>
            {
                var a = g.NodeById[e.StartId];
                var b = g.NodeById[e.EndId];
                return (e.Id, a.X, a.Y, b.X, b.Y);
            })
            .ToList();
        if (segments.Count >= 2)
        {
            var swept = SweptConflictIndex.Build(segments, fp.TurnRadius);
            foreach (var e in centralEdges)
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
                        sb.AppendLine($"TRAFFIC_FAIL swept conflict edges {e.Id}/{otherId} without capacity-1 resource");
                    }
                    else
                    {
                        sb.AppendLine($"TRAFFIC_OK conflict {e.Id}/{otherId} via {string.Join(",", shared)}");
                    }
                }
            }
        }

        sb.AppendLine($"LEVEL traffic={(trafficOk ? "PASS" : "FAIL")}");
        Assert.True(trafficOk, sb.ToString());

        // --- Level: motion (densify corridor) ---
        var motionOk = true;
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

            var samples = Math.Max(1, (int)Math.Ceiling(len / 0.05));
            for (var i = 0; i <= samples; i++)
            {
                var t = (double)i / samples;
                var x = a.X + (b.X - a.X) * t;
                var y = a.Y + (b.Y - a.Y) * t;
                // Distance to centerline is 0 by construction; check occupancy clearance and junction containment.
                var clearance = input.Occupancy!.ClearanceAt(x, y);
                if (clearance + 1e-9 < fp.HalfWidth)
                {
                    motionOk = false;
                    sb.AppendLine($"MOTION_FAIL densify edge {edgeId} at ({x:0.###},{y:0.###}) clearance={clearance:0.###}");
                }

                if (edge.IsJunction && !edge.IsConnector)
                {
                    var inZone = edge.ZoneCodes.Length == 0 ||
                                 input.Zones.Any(z =>
                                     z.IsActive &&
                                     edge.ZoneCodes.Contains(z.Code, StringComparer.Ordinal) &&
                                     (PointInRing(z.Ring, x, y) || DistToRing(z.Ring, x, y) <= 0.15));
                    if (!inZone)
                    {
                        motionOk = false;
                        sb.AppendLine($"MOTION_FAIL densify left junction corridor edge {edgeId} at ({x:0.###},{y:0.###})");
                    }
                }
            }
        }

        sb.AppendLine($"LEVEL static_corridor={(motionOk ? "PASS" : "FAIL")}");
        sb.AppendLine("LEVEL motion_execution=NOT_RUN (densify ≠ FollowPath)");
        sb.AppendLine("LEVEL traffic_e2e=NOT_RUN");
        Assert.True(motionOk, sb.ToString());

        // --- TURN_CLEARANCE classification (no suppress / no threshold drop) ---
        foreach (var issue in result.Issues.Where(i => i.Code == TrafficGraphCompiler.TurnClearance))
        {
            var code = issue.RelatedCodes.FirstOrDefault(c => !c.StartsWith("node:", StringComparison.Ordinal));
            if (code is null)
            {
                sb.AppendLine($"TURN keep {issue.Message}");
                continue;
            }

            var st = g.Stations.First(s => s.EndpointCode == code);
            var incident = g.Edges.Where(e => e.StartId == st.NodeId || e.EndId == st.NodeId).ToList();
            var incoming = incident.Where(e => e.EndId == st.NodeId).ToList();
            var outgoing = incident.Where(e => e.StartId == st.NodeId).ToList();
            var realPivot = false;
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
                    if (delta > Math.PI / 6)
                    {
                        realPivot = true;
                        sb.AppendLine(
                            $"TURN real_pivot {code} node={st.NodeId} " +
                            $"Δdeg={(delta * 180 / Math.PI).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)} " +
                            $"clr={input.Occupancy!.ClearanceAt(g.NodeById[st.NodeId].X, g.NodeById[st.NodeId].Y).ToString("0.000", System.Globalization.CultureInfo.InvariantCulture)} " +
                            $"need={fp.TurnRadius.ToString("0.000", System.Globalization.CultureInfo.InvariantCulture)}");
                    }
                }
            }

            if (!realPivot && incoming.Count > 0 && outgoing.Count > 0)
            {
                // False positive candidate — should not remain after kinematics fix.
                sb.AppendLine($"TURN false_positive_candidate {code} (no Δ>30° non-reverse)");
            }
            else if (!realPivot)
            {
                sb.AppendLine($"TURN reverse_only_or_deadend {code} — should not emit TURN_CLEARANCE");
            }
        }

        var falseTurn = result.Issues
            .Where(i => i.Code == TrafficGraphCompiler.TurnClearance)
            .Select(i => i.RelatedCodes.FirstOrDefault(c => !c.StartsWith("node:", StringComparison.Ordinal)))
            .Where(c => c is not null)
            .Where(code =>
            {
                var st = g.Stations.First(s => s.EndpointCode == code);
                var incident = g.Edges.Where(e => e.StartId == st.NodeId || e.EndId == st.NodeId).ToList();
                return !StationHasRealPivot(g, st.NodeId, incident);
            })
            .ToList();

        if (falseTurn.Count > 0)
        {
            sb.AppendLine($"TURN false positives requiring compiler fix: {string.Join(",", falseTurn)}");
        }

        sb.AppendLine(
            $"LEVEL turn_remaining={result.Issues.Count(i => i.Code == TrafficGraphCompiler.TurnClearance)} " +
            $"false_candidates={falseTurn.Count}");
        Assert.Empty(falseTurn);

        // --- SVG ---
        var svg = TrafficDebugSvgWriter.WriteHighlightedRoute(
            g,
            highlight,
            fp.HalfWidth,
            input.Occupancy,
            report.Issues,
            input.Zones,
            result.RejectedAccessPaths,
            title: "cycle ParkingA-Inbound-ShelfA01-Outbound");
        var svgPath = Path.Combine(MapSnapshotCompileHarness.ResolveSampleDir(MapFolder), "debug-cycle-route.svg");
        try
        {
            File.WriteAllText(svgPath, svg);
            sb.AppendLine($"SVG={svgPath}");
        }
        catch (IOException ex)
        {
            sb.AppendLine($"SVG_WRITE_SKIPPED={ex.GetType().Name}");
        }

        // Gazebo probe
        var gazebo = ProbeGazebo();
        sb.AppendLine($"LEVEL gazebo_e2e={gazebo}");

        output.WriteLine(sb.ToString());

        // Persist score summary for the acceptance doc consumers.
        File.WriteAllText(
            Path.Combine(MapSnapshotCompileHarness.ResolveSampleDir(MapFolder), "route-proof-levels.txt"),
            sb.ToString());
    }

    private static List<int>? CollectCycleEdges(
        CompiledTrafficGraph g,
        Dictionary<string, int> stations,
        string[] cycle,
        StringBuilder sb,
        string tag)
    {
        var all = new List<int>();
        for (var i = 0; i < cycle.Length - 1; i++)
        {
            var a = cycle[i];
            var b = cycle[i + 1];
            var path = g.ShortestPath(stations[a], stations[b]);
            if (path is null)
            {
                sb.AppendLine($"{tag} FAIL {a}→{b}: no ShortestPath");
                return null;
            }

            sb.AppendLine($"{tag} PASS {a}→{b} edges=[{string.Join(",", path)}]");
            all.AddRange(path);
        }

        return all;
    }

    private static bool StationHasRealPivot(CompiledTrafficGraph g, int nodeId, List<TrafficEdge> incident)
    {
        var incoming = incident.Where(e => e.EndId == nodeId).ToList();
        var outgoing = incident.Where(e => e.StartId == nodeId).ToList();
        if (incoming.Count == 0 || outgoing.Count == 0)
        {
            return false;
        }

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
                if (Math.Abs(Normalize(outAng - inAng)) > Math.PI / 6)
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static string ProbeGazebo()
    {
        try
        {
            // Isolated sim must not use production DB. We only probe for ROS/WSL presence.
            var wsl = Environment.GetEnvironmentVariable("WSL_DISTRO_NAME");
            if (!string.IsNullOrEmpty(wsl))
            {
                return "NOT_RUN (WSL present but MAP-ONE Gazebo world / bring-up not invoked in this agent session)";
            }

            // Windows host: check for wsl.exe
            var wslExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "wsl.exe");
            if (File.Exists(wslExe))
            {
                return "NOT_RUN (wsl.exe present; no isolated MAP-ONE Gazebo bring-up executed; do not use production Host DB)";
            }

            return "NOT_RUN (no WSL/ROS Gazebo session; missing isolated MAP-ONE world)";
        }
        catch (Exception ex)
        {
            return $"NOT_RUN ({ex.GetType().Name})";
        }
    }

    private static int edgeId(TrafficEdge e) => e.Id;

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
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
    }

    private static double Square(double v) => v * v;
}
