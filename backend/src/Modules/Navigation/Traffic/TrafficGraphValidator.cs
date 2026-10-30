using System.Globalization;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Traffic;

/// <summary>Static validation of a compiled traffic graph (Task C issue codes).</summary>
public static class TrafficGraphValidator
{
    public const string EndpointDisconnected = "ENDPOINT_DISCONNECTED";
    public const string EdgeDisconnected = "EDGE_DISCONNECTED";
    public const string AmbiguousIntersection = "AMBIGUOUS_INTERSECTION";
    public const string OneWayTrap = "ONE_WAY_TRAP";
    public const string InsufficientClearance = TrafficGraphCompiler.InsufficientClearance;
    public const string TurnClearance = TrafficGraphCompiler.TurnClearance;
    public const string ZoneRuleConflict = "ZONE_RULE_CONFLICT";
    public const string StopInNoStop = "STOP_IN_NO_STOP";
    public const string StopInJunction = "STOP_IN_JUNCTION";
    public const string CorridorNoStopline = "CORRIDOR_NO_STOPLINE";
    public const string NoSafeTerminal = "NO_SAFE_TERMINAL";
    public const string RecoveryUnreachable = "RECOVERY_UNREACHABLE";
    public const string RecoveryNoCapacity = "RECOVERY_NO_CAPACITY";
    public const string FrameMismatch = TrafficGraphCompiler.FrameMismatch;
    public const string ServiceStopInvalid = "SERVICE_STOP_INVALID";
    public const string OccupancyMissing = TrafficGraphCompiler.OccupancyMissing;
    public const string LegacyJunctionZone = TrafficGraphCompiler.LegacyJunctionZone;
    public const string CriticalNoExit = TrafficGraphCompiler.CriticalNoExit;
    public const string SafeStopInCritical = TrafficGraphCompiler.SafeStopInCritical;
    public const string OverlapAsymmetric = TrafficGraphCompiler.OverlapAsymmetric;

    public static TrafficValidationReport Validate(
        Guid mapVersionId,
        CompiledTrafficGraph graph,
        IReadOnlyList<TrafficIssue>? extraIssues = null,
        IReadOnlyList<TrafficZoneMeta>? zoneMeta = null,
        IReadOnlySet<string>? requiredStationCodes = null)
    {
        var issues = new List<TrafficIssue>();
        if (extraIssues is not null)
        {
            issues.AddRange(extraIssues);
        }

        issues.AddRange(graph.CompileIssues);

        var stationNodes = graph.Stations.Select(s => s.NodeId).ToHashSet();
        var endpointNodes = graph.Nodes.Where(n => n.EndpointCodes.Length > 0).ToList();

        foreach (var station in graph.Stations)
        {
            var reachableFromSelf = graph.Outgoing(station.NodeId).Any() ||
                                    graph.Edges.Any(e => e.EndId == station.NodeId);
            if (!reachableFromSelf && graph.Edges.Length > 0)
            {
                issues.Add(new TrafficIssue(
                    EndpointDisconnected,
                    TrafficIssueSeverity.Error,
                    $"Endpoint {station.EndpointCode} is disconnected from the lane graph.",
                    [station.EndpointCode]));
            }
        }

        // Pairwise station reachability.
        foreach (var from in endpointNodes)
        {
            foreach (var to in endpointNodes)
            {
                if (from.Id == to.Id)
                {
                    continue;
                }

                if (!graph.CanReach(from.Id, to.Id))
                {
                    issues.Add(new TrafficIssue(
                        EndpointDisconnected,
                        TrafficIssueSeverity.Error,
                        $"From {string.Join(",", from.EndpointCodes)} the robot cannot reach {string.Join(",", to.EndpointCodes)}.",
                        [.. from.EndpointCodes, .. to.EndpointCodes]));
                }
            }
        }

        foreach (var edge in graph.Edges)
        {
            if (!graph.NodeById.ContainsKey(edge.StartId) || !graph.NodeById.ContainsKey(edge.EndId))
            {
                issues.Add(new TrafficIssue(
                    EdgeDisconnected,
                    TrafficIssueSeverity.Error,
                    $"Edge {edge.Id} references a missing node.",
                    edge.EdgeCodes.Length > 0 ? edge.EdgeCodes.ToArray() : [$"edge:{edge.Id}"]));
            }
        }

        // Ambiguous intersection: degree ≥ 3 without critical/junction labeling.
        foreach (var node in graph.Nodes)
        {
            var incident = graph.Edges.Count(e => e.StartId == node.Id || e.EndId == node.Id);
            if (incident < 3)
            {
                continue;
            }

            var labeled = graph.Edges.Any(e =>
                (e.StartId == node.Id || e.EndId == node.Id) &&
                (e.IsJunction || e.InCriticalCorridor || e.SingleOccupancy || e.NoStop));
            if (!labeled)
            {
                issues.Add(new TrafficIssue(
                    AmbiguousIntersection,
                    TrafficIssueSeverity.Warning,
                    string.Create(CultureInfo.InvariantCulture,
                        $"Node {node.Id} at ({node.X:0.###}, {node.Y:0.###}) has {incident} incidents without a JUNCTION zone."),
                    node.EndpointCodes.Length > 0 ? node.EndpointCodes.ToArray() : [$"node:{node.Id}"]));
            }
        }

        // ONE_WAY_TRAP: non-endpoint node with no outgoing, or endpoint that cannot leave to another station.
        foreach (var node in graph.Nodes)
        {
            var outgoing = graph.Outgoing(node.Id).ToList();
            if (outgoing.Count > 0)
            {
                continue;
            }

            if (node.EndpointCodes.Length == 0)
            {
                var related = graph.Edges.Where(e => e.EndId == node.Id)
                    .SelectMany(e => e.EdgeCodes)
                    .Distinct(StringComparer.Ordinal)
                    .Order(StringComparer.Ordinal)
                    .ToList();
                issues.Add(new TrafficIssue(
                    OneWayTrap,
                    TrafficIssueSeverity.Error,
                    string.Create(CultureInfo.InvariantCulture,
                        $"Node {node.Id} is a one-way trap (no outgoing edge)."),
                    related.Count > 0 ? related : [$"node:{node.Id}"]));
            }
            else if (endpointNodes.Count > 1)
            {
                issues.Add(new TrafficIssue(
                    OneWayTrap,
                    TrafficIssueSeverity.Error,
                    $"Endpoint {string.Join(",", node.EndpointCodes)} has no outgoing path (one-way trap).",
                    node.EndpointCodes.ToArray()));
            }
        }

        // Zone capacity column removed — SINGLE_OCCUPANCY is the occupancy lock itself.
        _ = zoneMeta;

        foreach (var station in graph.Stations)
        {
            var node = graph.NodeById[station.NodeId];
            var criticalEdges = graph.Edges.Where(e =>
                (e.StartId == node.Id || e.EndId == node.Id) && e.InCriticalCorridor).ToList();
            if (criticalEdges.Any(e => e.NoStop))
            {
                issues.Add(new TrafficIssue(
                    StopInNoStop,
                    TrafficIssueSeverity.Error,
                    $"Station {station.EndpointCode} lies on a NO_STOP corridor.",
                    [station.EndpointCode]));
            }

            if (criticalEdges.Any(e => e.IsJunction || e.SingleOccupancy))
            {
                // Station node inside junction area.
                var inJunction = criticalEdges.Any(e => e.IsJunction || e.SingleOccupancy);
                if (inJunction && !station.IsServiceStop)
                {
                    issues.Add(new TrafficIssue(
                        StopInJunction,
                        TrafficIssueSeverity.Warning,
                        $"Station {station.EndpointCode} is adjacent to a junction/single-occupancy corridor.",
                        [station.EndpointCode]));
                }
            }
        }

        foreach (var corridor in graph.Corridors)
        {
            if (!graph.Stoplines.Any(s => s.CorridorId == corridor.Id))
            {
                issues.Add(new TrafficIssue(
                    CorridorNoStopline,
                    TrafficIssueSeverity.Error,
                    $"Critical corridor {corridor.Id} has no stopline at an entry.",
                    [$"corridor:{corridor.Id}", .. corridor.EdgeIds.Select(id => $"edge:{id}")]));
            }
        }

        var holdingOrStations = graph.Nodes.Count(n => n.IsHoldingPoint || n.IsStation);
        if (holdingOrStations == 0 && graph.Edges.Length > 0)
        {
            issues.Add(new TrafficIssue(
                NoSafeTerminal,
                TrafficIssueSeverity.Error,
                "Graph has no holding point or station where a robot can wait safely.",
                []));
        }

        var recovery = graph.Stations.Where(s => s.IsRecovery).ToList();
        if (recovery.Count > 0)
        {
            foreach (var station in graph.Stations.Where(s => !s.IsRecovery))
            {
                foreach (var bay in recovery)
                {
                    if (!graph.CanReach(station.NodeId, bay.NodeId) || !graph.CanReach(bay.NodeId, station.NodeId))
                    {
                        issues.Add(new TrafficIssue(
                            RecoveryUnreachable,
                            TrafficIssueSeverity.Error,
                            $"Recovery bay {bay.EndpointCode} is not mutually reachable from station {station.EndpointCode}.",
                            [bay.EndpointCode, station.EndpointCode]));
                    }
                }
            }

            if (recovery.Count < 1)
            {
                issues.Add(new TrafficIssue(
                    RecoveryNoCapacity,
                    TrafficIssueSeverity.Error,
                    "No recovery bay capacity available.",
                    []));
            }
        }

        foreach (var station in graph.Stations.Where(s => s.IsServiceStop))
        {
            if (station.NodeId == 0 || !graph.NodeById.ContainsKey(station.NodeId))
            {
                issues.Add(new TrafficIssue(
                    ServiceStopInvalid,
                    TrafficIssueSeverity.Error,
                    $"Service stop {station.EndpointCode} is not projected onto the graph.",
                    [station.EndpointCode]));
            }
        }

        if (requiredStationCodes is not null)
        {
            foreach (var code in requiredStationCodes.Order(StringComparer.Ordinal))
            {
                if (graph.Stations.All(s => s.EndpointCode != code))
                {
                    issues.Add(new TrafficIssue(
                        EndpointDisconnected,
                        TrafficIssueSeverity.Error,
                        $"Required station {code} is missing from the compiled graph.",
                        [code]));
                }
            }
        }

        // Safe stops must not lie inside NO_STOP / junction resources (except corridor entry stoplines).
        var stoplineNodes = graph.Stoplines.Select(s => s.NodeId).ToHashSet();
        var criticalEdgeIds = graph.Resources
            .Where(r => r.Kind is TrafficResourceKind.JunctionConflict or TrafficResourceKind.CriticalCorridor)
            .SelectMany(r => r.EdgeIds)
            .ToHashSet();
        var criticalInteriorNodes = graph.Edges
            .Where(e => criticalEdgeIds.Contains(e.Id) && (e.NoStop || e.IsJunction || e.SingleOccupancy))
            .SelectMany(e => new[] { e.StartId, e.EndId })
            .Where(nid => !stoplineNodes.Contains(nid))
            .ToHashSet();

        foreach (var node in graph.Nodes.Where(n => n.IsSafeStop))
        {
            if (criticalInteriorNodes.Contains(node.Id) && !stoplineNodes.Contains(node.Id))
            {
                issues.Add(new TrafficIssue(
                    SafeStopInCritical,
                    TrafficIssueSeverity.Error,
                    $"Safe-stop node {node.Id} lies inside a NO_STOP/junction resource.",
                    node.EndpointCodes.Length > 0 ? node.EndpointCodes.ToArray() : [$"node:{node.Id}"]));
            }
        }

        foreach (var resource in graph.Resources.Where(r =>
                     r.Kind is TrafficResourceKind.JunctionConflict
                         or TrafficResourceKind.CriticalCorridor
                         or TrafficResourceKind.NarrowBidirectional))
        {
            if (!graph.ExitSafeStopsByResourceId.TryGetValue(resource.Id, out var exits) || exits.Length == 0)
            {
                issues.Add(new TrafficIssue(
                    CriticalNoExit,
                    TrafficIssueSeverity.Error,
                    $"Critical resource {resource.Id} has no reachable safe-stop exit.",
                    resource.RelatedCodes.Length > 0 ? resource.RelatedCodes.ToArray() : [resource.Id]));
            }
        }

        if (graph.SweptConflicts is { } swept)
        {
            foreach (var edge in graph.Edges)
            {
                foreach (var otherId in swept.ConflictsWith(edge.Id))
                {
                    if (!swept.Conflicts(otherId, edge.Id))
                    {
                        issues.Add(new TrafficIssue(
                            OverlapAsymmetric,
                            TrafficIssueSeverity.Error,
                            $"Swept overlap asymmetric between edges {edge.Id} and {otherId}.",
                            [$"edge:{edge.Id}", $"edge:{otherId}"]));
                    }
                }
            }
        }

        // Deduplicate identical codes+related.
        var deduped = issues
            .GroupBy(i => (i.Code, i.Message, string.Join(",", i.RelatedCodes)))
            .Select(g => g.First())
            .ToList();

        var isValid = deduped.All(i => i.Severity != TrafficIssueSeverity.Error);
        return new TrafficValidationReport(
            mapVersionId,
            graph.GraphHash,
            isValid,
            deduped,
            graph.Nodes.Length,
            graph.Edges.Length,
            graph.Resources.Length,
            graph.Corridors.Length,
            graph.Nodes.Count(n => n.IsHoldingPoint),
            graph.Stoplines.Length,
            graph.Stations.Length);
    }
}
