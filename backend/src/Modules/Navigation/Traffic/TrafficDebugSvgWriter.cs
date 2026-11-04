using System.Globalization;
using System.Text;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;

namespace WaroTrans.Navigation.Traffic;

/// <summary>SVG overlay of a compiled traffic graph for map-editor debugging.</summary>
public static class TrafficDebugSvgWriter
{
    public const string ContentType = "image/svg+xml";

    public static string Write(
        CompiledTrafficGraph graph,
        OccupancyGrid? occupancy = null,
        IReadOnlyList<TrafficIssue>? issues = null,
        IReadOnlyList<RouteGraphZoneInput>? zones = null,
        IReadOnlyList<RejectedAccessPath>? rejectedAccess = null) =>
        WriteCore(graph, occupancy, issues, zones, rejectedAccess, highlightEdgeIds: null, halfWidth: null, title: null);

    /// <summary>
    /// Route-specific overlay: dims non-selected edges, highlights planner-chosen edges with footprint capsules
    /// and conflict resource labels.
    /// </summary>
    public static string WriteHighlightedRoute(
        CompiledTrafficGraph graph,
        IReadOnlySet<int> highlightEdgeIds,
        double halfWidthMeters,
        OccupancyGrid? occupancy = null,
        IReadOnlyList<TrafficIssue>? issues = null,
        IReadOnlyList<RouteGraphZoneInput>? zones = null,
        IReadOnlyList<RejectedAccessPath>? rejectedAccess = null,
        string? title = null) =>
        WriteCore(graph, occupancy, issues, zones, rejectedAccess, highlightEdgeIds, halfWidthMeters, title);

    private static string WriteCore(
        CompiledTrafficGraph graph,
        OccupancyGrid? occupancy,
        IReadOnlyList<TrafficIssue>? issues,
        IReadOnlyList<RouteGraphZoneInput>? zones,
        IReadOnlyList<RejectedAccessPath>? rejectedAccess,
        IReadOnlySet<int>? highlightEdgeIds,
        double? halfWidth,
        string? title)
    {
        var (minX, minY, maxX, maxY) = Bounds(graph, occupancy, zones);
        var pad = 0.5;
        minX -= pad;
        minY -= pad;
        maxX += pad;
        maxY += pad;
        var width = Math.Max(maxX - minX, 1);
        var height = Math.Max(maxY - minY, 1);
        var px = 800.0;
        var py = px * height / width;

        string Tx(double x) => ((x - minX) / width * px).ToString("0.###", CultureInfo.InvariantCulture);
        string Ty(double y) => ((maxY - y) / height * py).ToString("0.###", CultureInfo.InvariantCulture);
        double Sx(double meters) => meters / width * px;

        var sb = new StringBuilder();
        sb.Append(CultureInfo.InvariantCulture,
            $"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {px:0.###} {py:0.###}\" width=\"{px:0.###}\" height=\"{py:0.###}\">");
        sb.Append("<defs><marker id=\"arrow\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\">");
        sb.Append("<path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#e5e7eb\"/></marker>");
        sb.Append("<marker id=\"arrowHi\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\">");
        sb.Append("<path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#22d3ee\"/></marker></defs>");
        sb.Append("<rect width=\"100%\" height=\"100%\" fill=\"#111827\"/>");

        if (occupancy is not null)
        {
            var step = Math.Max(1, Math.Max(occupancy.Width, occupancy.Height) / 200);
            for (var row = 0; row < occupancy.Height; row += step)
            {
                for (var col = 0; col < occupancy.Width; col += step)
                {
                    if (!occupancy.Occupied[row * occupancy.Width + col])
                    {
                        continue;
                    }

                    var wx = occupancy.OriginX + (col + 0.5) * occupancy.Resolution;
                    // PGM row 0 is the top of the image (world max y).
                    var wy = occupancy.OriginY + (occupancy.Height - row - 0.5) * occupancy.Resolution;
                    sb.Append(CultureInfo.InvariantCulture,
                        $"<circle cx=\"{Tx(wx)}\" cy=\"{Ty(wy)}\" r=\"1\" fill=\"#4b5563\"/>");
                }
            }
        }

        if (zones is not null)
        {
            foreach (var zone in zones.Where(z => z.IsActive))
            {
                var fill = zone.ZoneType switch
                {
                    ZoneType.KEEP_OUT => "#7f1d1d88",
                    ZoneType.JUNCTION => "#a1620788",
                    ZoneType.SINGLE_OCCUPANCY => "#854d0e88",
                    ZoneType.NO_STOP => "#9a341288",
                    ZoneType.SPEED => "#1e3a8a88",
                    _ => "#37415188"
                };
                sb.Append(CultureInfo.InvariantCulture, $"<polygon fill=\"{fill}\" stroke=\"#fbbf24\" stroke-width=\"1\" points=\"");
                foreach (var p in zone.Ring)
                {
                    sb.Append(CultureInfo.InvariantCulture, $"{Tx(p.X)},{Ty(p.Y)} ");
                }

                sb.Append("\"/>");
            }
        }

        var nodes = graph.NodeById;
        foreach (var edge in graph.Edges)
        {
            var a = nodes[edge.StartId];
            var b = nodes[edge.EndId];
            var highlighted = highlightEdgeIds is not null && highlightEdgeIds.Contains(edge.Id);
            if (highlightEdgeIds is not null && !highlighted)
            {
                sb.Append(CultureInfo.InvariantCulture,
                    $"<line x1=\"{Tx(a.X)}\" y1=\"{Ty(a.Y)}\" x2=\"{Tx(b.X)}\" y2=\"{Ty(b.Y)}\" stroke=\"#374151\" stroke-width=\"1\" opacity=\"0.35\"/>");
                continue;
            }

            if (highlighted && halfWidth is { } hw && hw > 0)
            {
                // Footprint corridor capsule as thick translucent stroke.
                sb.Append(CultureInfo.InvariantCulture,
                    $"<line x1=\"{Tx(a.X)}\" y1=\"{Ty(a.Y)}\" x2=\"{Tx(b.X)}\" y2=\"{Ty(b.Y)}\" stroke=\"#22d3ee44\" stroke-width=\"{Sx(hw * 2):0.###}\" stroke-linecap=\"round\"/>");
            }

            var color = highlighted
                ? "#22d3ee"
                : edge.InCriticalCorridor ? "#f59e0b" : edge.IsConnector ? "#94a3b8" : "#38bdf8";
            var marker = highlighted ? "url(#arrowHi)" : "url(#arrow)";
            var sw = highlighted ? 3 : 2;
            sb.Append(CultureInfo.InvariantCulture,
                $"<line x1=\"{Tx(a.X)}\" y1=\"{Ty(a.Y)}\" x2=\"{Tx(b.X)}\" y2=\"{Ty(b.Y)}\" stroke=\"{color}\" stroke-width=\"{sw}\" marker-end=\"{marker}\"/>");

            if (highlighted)
            {
                if (occupancy is not null && halfWidth is { } hwClr && hwClr > 0)
                {
                    var len = Math.Sqrt((b.X - a.X) * (b.X - a.X) + (b.Y - a.Y) * (b.Y - a.Y));
                    var samples = Math.Max(1, (int)Math.Ceiling(len / 0.25));
                    for (var i = 0; i <= samples; i++)
                    {
                        var t = (double)i / samples;
                        var x = a.X + (b.X - a.X) * t;
                        var y = a.Y + (b.Y - a.Y) * t;
                        var clr = occupancy.ClearanceAt(x, y);
                        var ok = clr + 1e-9 >= hwClr;
                        sb.Append(CultureInfo.InvariantCulture,
                            $"<circle cx=\"{Tx(x)}\" cy=\"{Ty(y)}\" r=\"2.5\" fill=\"{(ok ? "#4ade80" : "#f87171")}\"/>");
                    }
                }

                var resources = graph.ResourcesByEdgeId.TryGetValue(edge.Id, out var ids)
                    ? string.Join(",", ids.Take(3))
                    : "";
                var mx = (a.X + b.X) / 2;
                var my = (a.Y + b.Y) / 2;
                var kind = edge.IsJunction ? "J" : edge.IsConnector ? "A" : "L";
                sb.Append(CultureInfo.InvariantCulture,
                    $"<text x=\"{Tx(mx)}\" y=\"{Ty(my)}\" fill=\"#a5f3fc\" font-size=\"8\">{edge.Id}:{kind}</text>");
                if (resources.Length > 0)
                {
                    sb.Append(CultureInfo.InvariantCulture,
                        $"<text x=\"{Tx(mx)}\" y=\"{Ty(my)}\" dy=\"10\" fill=\"#67e8f9\" font-size=\"7\">{resources}</text>");
                }
            }
        }

        foreach (var node in graph.Nodes)
        {
            var fill = node.IsStation ? "#22c55e" : node.IsHoldingPoint ? "#a855f7" : "#e5e7eb";
            sb.Append(CultureInfo.InvariantCulture,
                $"<circle cx=\"{Tx(node.X)}\" cy=\"{Ty(node.Y)}\" r=\"4\" fill=\"{fill}\" stroke=\"#111827\" stroke-width=\"1\"/>");
            sb.Append(CultureInfo.InvariantCulture,
                $"<text x=\"{Tx(node.X)}\" y=\"{Ty(node.Y)}\" dx=\"6\" dy=\"-6\" fill=\"#f9fafb\" font-size=\"10\">{node.Id}</text>");
        }

        foreach (var stop in graph.Stoplines)
        {
            var n = nodes[stop.NodeId];
            sb.Append(CultureInfo.InvariantCulture,
                $"<rect x=\"{(double.Parse(Tx(n.X), CultureInfo.InvariantCulture) - 4).ToString("0.###", CultureInfo.InvariantCulture)}\" y=\"{(double.Parse(Ty(n.Y), CultureInfo.InvariantCulture) - 4).ToString("0.###", CultureInfo.InvariantCulture)}\" width=\"8\" height=\"8\" fill=\"#ef4444\"/>");
        }

        if (rejectedAccess is not null)
        {
            foreach (var rej in rejectedAccess)
            {
                sb.Append(CultureInfo.InvariantCulture,
                    $"<line x1=\"{Tx(rej.FootX)}\" y1=\"{Ty(rej.FootY)}\" x2=\"{Tx(rej.GoalX)}\" y2=\"{Ty(rej.GoalY)}\" stroke=\"#f87171\" stroke-width=\"2\" stroke-dasharray=\"4 3\"/>");
                sb.Append(CultureInfo.InvariantCulture,
                    $"<circle cx=\"{Tx(rej.GoalX)}\" cy=\"{Ty(rej.GoalY)}\" r=\"7\" fill=\"none\" stroke=\"#f87171\" stroke-width=\"2\"/>");
                sb.Append(CultureInfo.InvariantCulture,
                    $"<text x=\"{Tx(rej.GoalX)}\" y=\"{Ty(rej.GoalY)}\" dx=\"8\" dy=\"12\" fill=\"#fecaca\" font-size=\"9\">{rej.EndpointCode}:{rej.Reason}</text>");
            }
        }

        if (issues is not null)
        {
            foreach (var issue in issues.Where(i =>
                         i.Code is TrafficGraphValidator.InsufficientClearance
                             or TrafficGraphValidator.TurnClearance
                             or TrafficGraphCompiler.ServiceAccessBlocked
                             or TrafficGraphCompiler.JunctionTransitionBlocked
                             or TrafficGraphValidator.OneWayTrap
                             or TrafficGraphValidator.AmbiguousIntersection))
            {
                var stroke = issue.Code switch
                {
                    TrafficGraphValidator.TurnClearance => "#f97316",
                    TrafficGraphValidator.OneWayTrap => "#e11d48",
                    TrafficGraphValidator.AmbiguousIntersection => "#eab308",
                    _ => "#ef4444"
                };
                foreach (var related in issue.RelatedCodes)
                {
                    if (related.StartsWith("node:", StringComparison.Ordinal) &&
                        int.TryParse(related.AsSpan(5), out var nodeId) &&
                        nodes.TryGetValue(nodeId, out var n))
                    {
                        sb.Append(CultureInfo.InvariantCulture,
                            $"<circle cx=\"{Tx(n.X)}\" cy=\"{Ty(n.Y)}\" r=\"8\" fill=\"none\" stroke=\"{stroke}\" stroke-width=\"2\"/>");
                        sb.Append(CultureInfo.InvariantCulture,
                            $"<text x=\"{Tx(n.X)}\" y=\"{Ty(n.Y)}\" dx=\"8\" dy=\"14\" fill=\"{stroke}\" font-size=\"9\">{issue.Code}</text>");
                    }

                    var station = graph.Stations.FirstOrDefault(s =>
                        string.Equals(s.EndpointCode, related, StringComparison.Ordinal));
                    if (station is not null && nodes.TryGetValue(station.NodeId, out var sn))
                    {
                        sb.Append(CultureInfo.InvariantCulture,
                            $"<circle cx=\"{Tx(sn.X)}\" cy=\"{Ty(sn.Y)}\" r=\"9\" fill=\"none\" stroke=\"#fb7185\" stroke-width=\"2\"/>");
                    }
                }
            }
        }

        var hashPreview = graph.GraphHash.Length <= 12 ? graph.GraphHash : graph.GraphHash[..12];
        var sabCount = issues?.Count(i => i.Code == TrafficGraphCompiler.ServiceAccessBlocked) ?? 0;
        var turnCount = issues?.Count(i => i.Code == TrafficGraphValidator.TurnClearance) ?? 0;
        var trapCount = issues?.Count(i => i.Code == TrafficGraphValidator.OneWayTrap) ?? 0;
        var hiCount = highlightEdgeIds?.Count ?? 0;
        var label = string.IsNullOrWhiteSpace(title) ? "route-debug" : title;
        sb.Append(CultureInfo.InvariantCulture,
            $"<text x=\"12\" y=\"20\" fill=\"#f9fafb\" font-size=\"12\">{label} hash={hashPreview}… n={graph.Nodes.Length} e={graph.Edges.Length} hi={hiCount} sab={sabCount} turn={turnCount} trap={trapCount}</text>");
        sb.Append("</svg>");
        return sb.ToString();
    }

    private static (double MinX, double MinY, double MaxX, double MaxY) Bounds(
        CompiledTrafficGraph graph,
        OccupancyGrid? occupancy,
        IReadOnlyList<RouteGraphZoneInput>? zones)
    {
        double minX = double.PositiveInfinity, minY = double.PositiveInfinity;
        double maxX = double.NegativeInfinity, maxY = double.NegativeInfinity;
        void Acc(double x, double y)
        {
            minX = Math.Min(minX, x);
            minY = Math.Min(minY, y);
            maxX = Math.Max(maxX, x);
            maxY = Math.Max(maxY, y);
        }

        foreach (var n in graph.Nodes)
        {
            Acc(n.X, n.Y);
        }

        if (zones is not null)
        {
            foreach (var p in zones.SelectMany(z => z.Ring))
            {
                Acc(p.X, p.Y);
            }
        }

        if (occupancy is not null)
        {
            Acc(occupancy.OriginX, occupancy.OriginY);
            Acc(occupancy.OriginX + occupancy.Width * occupancy.Resolution,
                occupancy.OriginY + occupancy.Height * occupancy.Resolution);
        }

        if (!double.IsFinite(minX))
        {
            return (0, 0, 10, 10);
        }

        return (minX, minY, maxX, maxY);
    }
}
