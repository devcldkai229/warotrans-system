using System.Globalization;
using System.Text;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using Xunit.Abstractions;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>
/// Root-cause TURN_CLEARANCE: classify reverse-out / continuous arc / true pivot with rectangular sweeps.
/// DB read-only snapshot. Does not claim FollowPath or Gazebo E2E.
/// </summary>
public sealed class MapOneTurnManeuverAuditTests(ITestOutputHelper output)
{
    private const string MapFolder = "MAP-ONE-V001";

    private static readonly string[] PriorityOrder =
    [
        "EP-PARKING-A", "EP-OUTBOUND",
        "EP-PARKING-B", "EP-SHELFA04", "EP-CHARGING-A", "EP-SHELFB04",
        "EP-SHELFB01", "EP-SHELFB03", "EP-SHELFC02", "EP-QUEUE-POINT",
        "EP-INBOUND", "EP-SHELFA01", "EP-INSPECTION", "EP-SHELFA02", "EP-SHELFA03",
        "EP-SHELFB02", "EP-SHELFC01"
    ];

    private static readonly string[] ForwardCycle =
    [
        "EP-PARKING-A", "EP-INBOUND", "EP-SHELFA01", "EP-OUTBOUND", "EP-PARKING-A"
    ];

    [Fact]
    public void Turn_maneuver_audit_and_svgs()
    {
        var input = MapSnapshotCompileHarness.Load(MapFolder);
        Assert.NotNull(input.Occupancy);
        Assert.NotNull(input.EndpointYaw);

        var result = TrafficGraphCompiler.Compile(input);
        var g = result.Graph;
        var fp = input.Footprint;
        var root = MapSnapshotCompileHarness.ResolveSampleDir(MapFolder);
        var sb = new StringBuilder();
        var inv = CultureInfo.InvariantCulture;

        sb.AppendLine(inv, $"compiler={TrafficGraphCompiler.CompilerVersion} hash={g.GraphHash}");
        sb.AppendLine(inv, $"nodes={g.Nodes.Length} edges={g.Edges.Length}");
        sb.AppendLine(
            "LEVEL followpath_exec=PARTIAL (Forward/Reverse/Spin on MotionAuthority; ContinuousArc not executable; enable_authority_gate required)");
        sb.AppendLine("LEVEL gazebo_e2e_MAP-ONE=NOT_RUN (no MAP-ONE Gazebo world; warehouse.sdf only)");

        var stations = g.Stations.ToDictionary(s => s.EndpointCode, s => s, StringComparer.Ordinal);
        var cycleEdgeIds = new HashSet<int>();
        for (var i = 0; i < ForwardCycle.Length - 1; i++)
        {
            var path = g.ShortestPath(stations[ForwardCycle[i]].NodeId, stations[ForwardCycle[i + 1]].NodeId);
            Assert.NotNull(path);
            foreach (var e in path!)
            {
                cycleEdgeIds.Add(e);
            }
        }

        // ONE_WAY: cycle edges must not reverse authored ONE_WAY codes as connectors.
        var oneWay = input.LaneMeta.Where(m => m.Direction == EdgeDirection.ONE_WAY)
            .Select(m => m.Code).ToHashSet(StringComparer.Ordinal);
        foreach (var eid in cycleEdgeIds)
        {
            var edge = g.Edges.First(e => e.Id == eid);
            Assert.False(
                edge.IsConnector && edge.EdgeCodes.Any(oneWay.Contains),
                $"cycle connector {eid} carries ONE_WAY codes");
            // Capacity-1 resource coverage for cycle edges that are junction.
            if (edge.IsJunction)
            {
                var hasMutex = g.Resources.Any(r =>
                    r.Capacity <= 1 &&
                    r.EdgeIds.Contains(eid) &&
                    r.Kind is not TrafficResourceKind.Lane);
                Assert.True(hasMutex, $"cycle junction edge {eid} missing capacity-1 resource");
            }
        }

        sb.AppendLine("LEVEL cycle_authorized_route=PASS");
        sb.AppendLine("LEVEL cycle_traffic_resources=PASS");

        var turnBefore = result.Issues.Count(i => i.Code == TrafficGraphCompiler.TurnClearance);
        sb.AppendLine(inv, $"TURN_ISSUES_AFTER_CLASSIFIER={turnBefore}");

        var auditCodes = PriorityOrder.Where(stations.ContainsKey).ToList();
        // Always include stations that still have TURN issues.
        foreach (var issue in result.Issues.Where(i => i.Code == TrafficGraphCompiler.TurnClearance))
        {
            var c = issue.RelatedCodes.FirstOrDefault(x => !x.StartsWith("node:", StringComparison.Ordinal));
            if (c is not null && !auditCodes.Contains(c, StringComparer.Ordinal))
            {
                auditCodes.Add(c);
            }
        }

        foreach (var code in auditCodes)
        {
            var st = stations[code];
            var node = g.NodeById[st.NodeId];
            var yaw = input.EndpointYaw![code];
            var incident = g.Edges.Where(e => e.StartId == st.NodeId || e.EndId == st.NodeId).ToList();
            var onCycle = incident.Any(e => cycleEdgeIds.Contains(e.Id));
            var verdict = StationManeuverClassifier.Evaluate(
                code, st.NodeId, incident, id => (g.NodeById[id].X, g.NodeById[id].Y), fp, input.Occupancy, yaw);

            var classCounts = verdict.Pairs
                .GroupBy(p => p.Class)
                .Select(x => $"{x.Key}={x.Count()}");
            var pivotPairs = verdict.Pairs.Where(p => p.Class == StationManeuverClassifier.ManeuverClass.TruePivot)
                .ToList();
            var status = !verdict.NeedsPivotClearance
                ? "PASS_no_pivot"
                : verdict.PivotClearanceOk
                    ? "PASS_pivot_clear"
                    : "FAIL_pivot_map_data";

            sb.AppendLine(inv,
                $"STATION {code} node={st.NodeId} pose=({node.X:0.###},{node.Y:0.###}) yaw={yaw:0.####} " +
                $"clr={input.Occupancy!.ClearanceAt(node.X, node.Y):0.###} needTurnR={fp.TurnRadius:0.###} " +
                $"onCycle={onCycle} needsPivot={verdict.NeedsPivotClearance} pivotOk={verdict.PivotClearanceOk} " +
                $"failReason={verdict.FailReason ?? "-"} status={status} classes=[{string.Join(",", classCounts)}]");

            foreach (var p in verdict.Pairs.Where(p =>
                         p.Class is StationManeuverClassifier.ManeuverClass.TruePivot
                             or StationManeuverClassifier.ManeuverClass.ContinuousArc
                             or StationManeuverClassifier.ManeuverClass.YawDriveInReverseOut))
            {
                sb.AppendLine(inv,
                    $"  PAIR in={p.InEdgeId} out={p.OutEdgeId} Δdeg={p.DeltaDeg:0.0} class={p.Class} " +
                    $"detail={p.CollisionDetail ?? "-"}");
            }

            if (status == "FAIL_pivot_map_data")
            {
                sb.AppendLine(inv,
                    $"  MAP_DATA keep TURN_CLEARANCE failReason={verdict.FailReason ?? "unknown"}; " +
                    $"editor: free space to ≥{fp.TurnRadius:0.###} m AND pivot_rect clear at " +
                    $"({node.X:0.###},{node.Y:0.###}) or move pose (AI will not move Endpoint). " +
                    $"pivotPairs={pivotPairs.Count}");
            }

            // Assert SHELFC01 fail is pivot_rect (disk clr may exceed TurnRadius).
            if (string.Equals(code, "EP-SHELFC01", StringComparison.Ordinal) && status == "FAIL_pivot_map_data")
            {
                Assert.StartsWith("pivot_rect", verdict.FailReason ?? "");
            }

            WriteStationSvg(
                Path.Combine(root, $"debug-turn-{code}.svg"),
                g, input, st, yaw, verdict, cycleEdgeIds, status);
            sb.AppendLine($"  SVG=debug-turn-{code}.svg");
        }

        // Priority stations must be classified (not silently skipped).
        Assert.Contains(auditCodes, c => c == "EP-PARKING-A");
        Assert.Contains(auditCodes, c => c == "EP-OUTBOUND");

        File.WriteAllText(Path.Combine(root, "turn-maneuver-audit.txt"), sb.ToString());
        output.WriteLine(sb.ToString());
    }

    private static void WriteStationSvg(
        string path,
        CompiledTrafficGraph g,
        TrafficCompileInput input,
        TrafficStation st,
        double yaw,
        StationManeuverClassifier.StationVerdict verdict,
        HashSet<int> cycleEdgeIds,
        string status)
    {
        var node = g.NodeById[st.NodeId];
        var pad = 1.2;
        var minX = node.X - pad;
        var maxX = node.X + pad;
        var minY = node.Y - pad;
        var maxY = node.Y + pad;
        var w = 480.0;
        var h = 480.0;
        string Tx(double x) => ((x - minX) / (maxX - minX) * w).ToString("0.##", CultureInfo.InvariantCulture);
        string Ty(double y) => ((maxY - y) / (maxY - minY) * h).ToString("0.##", CultureInfo.InvariantCulture);

        var sb = new StringBuilder();
        sb.Append(CultureInfo.InvariantCulture,
            $"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {w} {h}\" width=\"{w}\" height=\"{h}\">");
        sb.Append("<rect width=\"100%\" height=\"100%\" fill=\"#111827\"/>");

        if (input.Occupancy is { } occ)
        {
            var step = Math.Max(1, Math.Max(occ.Width, occ.Height) / 120);
            for (var row = 0; row < occ.Height; row += step)
            {
                for (var col = 0; col < occ.Width; col += step)
                {
                    if (!occ.Occupied[row * occ.Width + col])
                    {
                        continue;
                    }

                    var wx = occ.OriginX + (col + 0.5) * occ.Resolution;
                    var wy = occ.OriginY + (occ.Height - row - 0.5) * occ.Resolution;
                    if (wx < minX || wx > maxX || wy < minY || wy > maxY)
                    {
                        continue;
                    }

                    sb.Append(CultureInfo.InvariantCulture,
                        $"<circle cx=\"{Tx(wx)}\" cy=\"{Ty(wy)}\" r=\"1.2\" fill=\"#4b5563\"/>");
                }
            }
        }

        foreach (var edge in g.Edges.Where(e => e.StartId == st.NodeId || e.EndId == st.NodeId))
        {
            var a = g.NodeById[edge.StartId];
            var b = g.NodeById[edge.EndId];
            var onCycle = cycleEdgeIds.Contains(edge.Id);
            var color = onCycle ? "#22d3ee" : "#64748b";
            sb.Append(CultureInfo.InvariantCulture,
                $"<line x1=\"{Tx(a.X)}\" y1=\"{Ty(a.Y)}\" x2=\"{Tx(b.X)}\" y2=\"{Ty(b.Y)}\" stroke=\"{color}\" stroke-width=\"2\"/>");
        }

        // Final pose + yaw arrow
        var tipX = node.X + 0.35 * Math.Cos(yaw);
        var tipY = node.Y + 0.35 * Math.Sin(yaw);
        sb.Append(CultureInfo.InvariantCulture,
            $"<circle cx=\"{Tx(node.X)}\" cy=\"{Ty(node.Y)}\" r=\"6\" fill=\"#22c55e\" stroke=\"#fff\" stroke-width=\"1\"/>");
        sb.Append(CultureInfo.InvariantCulture,
            $"<line x1=\"{Tx(node.X)}\" y1=\"{Ty(node.Y)}\" x2=\"{Tx(tipX)}\" y2=\"{Ty(tipY)}\" stroke=\"#fbbf24\" stroke-width=\"3\"/>");

        // Footprint rectangle at final yaw
        AppendRect(sb, node.X, node.Y, yaw, input.Footprint, Tx, Ty, "#4ade8088");

        var fill = status.StartsWith("FAIL", StringComparison.Ordinal) ? "#ef4444" : "#4ade80";
        sb.Append(CultureInfo.InvariantCulture,
            $"<text x=\"12\" y=\"22\" fill=\"{fill}\" font-size=\"13\">{verdict.EndpointCode} {status}</text>");
        sb.Append(CultureInfo.InvariantCulture,
            $"<text x=\"12\" y=\"40\" fill=\"#e5e7eb\" font-size=\"11\">yaw={yaw:0.###} needsPivot={verdict.NeedsPivotClearance} pairs={verdict.Pairs.Count}</text>");
        sb.Append("</svg>");
        File.WriteAllText(path, sb.ToString());
    }

    private static void AppendRect(
        StringBuilder sb,
        double x,
        double y,
        double yaw,
        TrafficFootprintOptions fp,
        Func<double, string> Tx,
        Func<double, string> Ty,
        string fill)
    {
        var halfL = fp.LengthMeters / 2 + fp.PaddingMeters;
        var halfW = fp.WidthMeters / 2 + fp.PaddingMeters;
        var c = Math.Cos(yaw);
        var s = Math.Sin(yaw);
        (double, double)[] corners =
        [
            (halfL, halfW), (halfL, -halfW), (-halfL, -halfW), (-halfL, halfW)
        ];
        sb.Append($"<polygon fill=\"{fill}\" stroke=\"#86efac\" stroke-width=\"1\" points=\"");
        foreach (var (lx, ly) in corners)
        {
            var wx = x + lx * c - ly * s;
            var wy = y + lx * s + ly * c;
            sb.Append(CultureInfo.InvariantCulture, $"{Tx(wx)},{Ty(wy)} ");
        }

        sb.Append("\"/>");
    }
}
