using System.Collections.Frozen;
using System.Collections.Immutable;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;

namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// Compiles an immutable <see cref="CompiledTrafficGraph"/> on top of <see cref="RouteGraphBuilder"/>.
/// Pure: same input → same GraphHash and edge/node ids.
/// </summary>
public static class TrafficGraphCompiler
{
    public const string LegacyJunctionZone = "LEGACY_JUNCTION_ZONE";
    public const string OccupancyMissing = "OCCUPANCY_MISSING";
    public const string FrameMismatch = "FRAME_MISMATCH";
    public const string InsufficientClearance = "INSUFFICIENT_CLEARANCE";
    public const string TurnClearance = "TURN_CLEARANCE";
    public const string CriticalNoExit = "CRITICAL_NO_EXIT";
    public const string SafeStopInCritical = "SAFE_STOP_IN_CRITICAL";
    public const string OverlapAsymmetric = "OVERLAP_ASYMMETRIC";

    public static TrafficCompileResult Compile(TrafficCompileInput input, RouteGraphOptions? routeOptions = null)
    {
        var issues = new List<TrafficIssue>();
        var footprint = input.Footprint;

        if (!string.Equals(input.FrameId, input.ExpectedFrameId, StringComparison.Ordinal))
        {
            issues.Add(new TrafficIssue(
                FrameMismatch,
                TrafficIssueSeverity.Error,
                $"Map frame '{input.FrameId}' does not match expected '{input.ExpectedFrameId}'.",
                [input.FrameId, input.ExpectedFrameId]));
        }

        foreach (var zone in input.Zones.Where(z => z.IsActive))
        {
            if (zone.ZoneType is ZoneType.SINGLE_OCCUPANCY or ZoneType.NO_STOP)
            {
                issues.Add(new TrafficIssue(
                    LegacyJunctionZone,
                    TrafficIssueSeverity.Warning,
                    $"Zone {zone.Code} ({zone.ZoneType}) is used as a junction connect; prefer ZoneType JUNCTION.",
                    [zone.Code]));
            }
        }

        if (input.Occupancy is null)
        {
            issues.Add(new TrafficIssue(
                OccupancyMissing,
                TrafficIssueSeverity.Warning,
                "No occupancy grid supplied; clearance and turn checks are skipped.",
                []));
        }

        var routeInput = new RouteGraphInput(input.Name, input.FrameId, input.Edges, input.Endpoints, input.Zones);
        var routeResult = RouteGraphBuilder.Build(routeInput, routeOptions);
        foreach (var issue in routeResult.Issues)
        {
            issues.Add(new TrafficIssue(
                issue.Code,
                issue.Severity == RouteGraphIssueSeverity.Error ? TrafficIssueSeverity.Error : TrafficIssueSeverity.Warning,
                issue.Message,
                issue.RelatedCodes));
        }

        var route = routeResult.Graph;
        var graphHash = ComputeGraphHash(input, routeOptions);
        var laneMeta = input.LaneMeta.ToDictionary(m => m.Code, StringComparer.Ordinal);
        var zoneMeta = input.ZoneMeta.ToDictionary(m => m.Code, StringComparer.Ordinal);
        var criticalZoneCodes = input.Zones
            .Where(z => z.IsActive && z.ZoneType is ZoneType.JUNCTION or ZoneType.SINGLE_OCCUPANCY or ZoneType.NO_STOP)
            .Select(z => z.Code)
            .ToHashSet(StringComparer.Ordinal);

        var nodesById = route.Nodes.ToDictionary(n => n.Id);
        var trafficEdges = new List<TrafficEdge>(route.Edges.Count);
        foreach (var edge in route.Edges)
        {
            var a = nodesById[edge.StartId];
            var b = nodesById[edge.EndId];
            var length = Math.Sqrt(Square(b.X - a.X) + Square(b.Y - a.Y));
            var inCritical = edge.NoStop || edge.SingleOccupancy || edge.IsJunction ||
                             edge.ZoneCodes.Any(criticalZoneCodes.Contains);

            if (input.Occupancy is { } grid && length > 1e-9)
            {
                var clearance = grid.MinClearanceAlong(a.X, a.Y, b.X, b.Y);
                if (clearance + 1e-9 < footprint.HalfWidth)
                {
                    issues.Add(new TrafficIssue(
                        InsufficientClearance,
                        TrafficIssueSeverity.Error,
                        string.Create(CultureInfo.InvariantCulture,
                            $"Edge {edge.Id} clearance {clearance:0.###} m < required {footprint.HalfWidth:0.###} m."),
                        edge.EdgeCodes.Count > 0 ? edge.EdgeCodes : [$"edge:{edge.Id}"]));
                }
            }

            foreach (var code in edge.EdgeCodes)
            {
                if (laneMeta.TryGetValue(code, out var meta) &&
                    meta.WidthMeters + 1e-9 < footprint.WidthMeters + 2 * footprint.PaddingMeters)
                {
                    issues.Add(new TrafficIssue(
                        InsufficientClearance,
                        TrafficIssueSeverity.Error,
                        string.Create(CultureInfo.InvariantCulture,
                            $"Lane {code} WidthMeters {meta.WidthMeters:0.###} < robot width+padding {footprint.WidthMeters + 2 * footprint.PaddingMeters:0.###}."),
                        [code]));
                }
            }

            trafficEdges.Add(new TrafficEdge(
                edge.Id,
                edge.StartId,
                edge.EndId,
                [.. edge.EdgeCodes],
                edge.AbsSpeedLimit,
                edge.IsConnector,
                [.. edge.ZoneCodes],
                edge.NoStop,
                edge.SingleOccupancy,
                edge.IsJunction,
                length,
                inCritical));
        }

        var resources = new List<TrafficResource>();
        BuildLaneResources(trafficEdges, laneMeta, resources);
        BuildNarrowBidirectionalResources(trafficEdges, laneMeta, resources);
        BuildZoneResources(trafficEdges, input.Zones, zoneMeta, resources);
        BuildJunctionConflictGroups(trafficEdges, input.Zones, zoneMeta, resources);

        // Only critical edges that are NOT already covered by a junction conflict get a corridor resource
        // (avoids duplicating junction groups as CriticalCorridor).
        var (corridors, corridorResourceIds) = BuildCriticalCorridors(trafficEdges, resources);
        foreach (var (corridor, resourceId) in corridors.Zip(corridorResourceIds))
        {
            resources.Add(new TrafficResource(
                resourceId,
                TrafficResourceKind.CriticalCorridor,
                1,
                corridor.EdgeIds,
                [$"corridor:{corridor.Id}"]));
        }

        var stationMeta = (input.StationMeta ?? Array.Empty<TrafficStationMeta>())
            .ToDictionary(m => m.EndpointCode, m => m.BayKind, StringComparer.Ordinal);
        var serviceStops = input.ServiceStopEndpointCodes ??
                           DeriveServiceStops(stationMeta);
        var recoveryStops = input.RecoveryEndpointCodes ??
                            DeriveRecoveryStops(stationMeta);

        var stations = new List<TrafficStation>();
        var stationNodeIds = new HashSet<int>();
        foreach (var node in route.Nodes.Where(n => n.EndpointCodes.Count > 0))
        {
            foreach (var code in node.EndpointCodes)
            {
                // Both directions of the stop↔lane connector: a robot leaving the bay must hold it too.
                var accessEdgeIds = trafficEdges
                    .Where(e => e.IsConnector && (e.StartId == node.Id || e.EndId == node.Id))
                    .Select(e => e.Id)
                    .OrderBy(id => id)
                    .ToImmutableArray();
                int? access = accessEdgeIds.IsEmpty ? null : accessEdgeIds[0];
                var bayKind = ResolveBayKind(code, stationMeta, serviceStops, recoveryStops);
                var isService = serviceStops.Contains(code) || bayKind == TrafficStationBayKind.Service;
                var isRecovery = recoveryStops.Contains(code) || bayKind == TrafficStationBayKind.Recovery;
                stations.Add(new TrafficStation(
                    code,
                    node.Id,
                    access,
                    isService,
                    isRecovery,
                    bayKind));
                stationNodeIds.Add(node.Id);

                if (access is not null)
                {
                    var bayResourceKind = isRecovery || bayKind is TrafficStationBayKind.Holding
                        ? TrafficResourceKind.HoldingBay
                        : isService || bayKind is TrafficStationBayKind.Service
                            ? TrafficResourceKind.ServiceCorridor
                            : TrafficResourceKind.StationBay;
                    resources.Add(new TrafficResource(
                        $"bay:{code}",
                        bayResourceKind,
                        1,
                        accessEdgeIds,
                        [code]));
                }
            }
        }

        var criticalNodeIds = trafficEdges
            .Where(e => e.InCriticalCorridor || e.NoStop || e.IsJunction || e.SingleOccupancy)
            .SelectMany(e => new[] { e.StartId, e.EndId })
            .ToHashSet();

        var holding = new HashSet<int>();
        foreach (var node in route.Nodes)
        {
            if (criticalNodeIds.Contains(node.Id) || stationNodeIds.Contains(node.Id))
            {
                continue;
            }

            if (input.Occupancy is { } grid)
            {
                var clearance = grid.ClearanceAt(node.X, node.Y);
                if (clearance + 1e-9 < footprint.TurnRadius)
                {
                    continue;
                }
            }

            holding.Add(node.Id);
        }

        // Turn clearance at nodes that change direction / stations / holding.
        if (input.Occupancy is { } occ)
        {
            foreach (var node in route.Nodes)
            {
                var degree = trafficEdges.Count(e => e.StartId == node.Id || e.EndId == node.Id);
                var needsTurn = degree >= 3 || stationNodeIds.Contains(node.Id) || holding.Contains(node.Id);
                if (!needsTurn)
                {
                    // Also check when incoming/outgoing headings differ by > ~30°.
                    needsTurn = HasHeadingChange(node.Id, trafficEdges, nodesById);
                }

                if (!needsTurn)
                {
                    continue;
                }

                var clearance = occ.ClearanceAt(node.X, node.Y);
                if (clearance + 1e-9 < footprint.TurnRadius)
                {
                    issues.Add(new TrafficIssue(
                        TurnClearance,
                        TrafficIssueSeverity.Error,
                        string.Create(CultureInfo.InvariantCulture,
                            $"Node {node.Id} turn clearance {clearance:0.###} m < required {footprint.TurnRadius:0.###} m."),
                        node.EndpointCodes.Count > 0 ? node.EndpointCodes : [$"node:{node.Id}"]));
                }
            }
        }

        var stoplines = new List<TrafficStopline>();
        foreach (var corridor in corridors)
        {
            var edgeSet = corridor.EdgeIds.ToHashSet();
            foreach (var edgeId in corridor.EdgeIds)
            {
                var edge = trafficEdges.First(e => e.Id == edgeId);
                var hasExternalIn = trafficEdges.Any(e =>
                    e.EndId == edge.StartId && !edgeSet.Contains(e.Id) && !e.InCriticalCorridor);
                if (hasExternalIn || !trafficEdges.Any(e => e.EndId == edge.StartId && edgeSet.Contains(e.Id)))
                {
                    // Entry: edge starts at corridor boundary.
                    var isEntry = !trafficEdges.Any(e => e.EndId == edge.StartId && edgeSet.Contains(e.Id));
                    if (isEntry)
                    {
                        stoplines.Add(new TrafficStopline(edge.StartId, corridor.Id, edge.Id));
                        holding.Add(edge.StartId); // stopline nodes are holdable waits
                    }
                }
            }
        }

        var stoplineNodeIds = stoplines.Select(s => s.NodeId).ToHashSet();

        // Safe-stop candidates: holding, stopline entry, or station — but never inside critical/NO_STOP/junction.
        var safeStopCandidates = new HashSet<int>(holding);
        foreach (var id in stoplineNodeIds)
        {
            safeStopCandidates.Add(id);
        }

        foreach (var id in stationNodeIds)
        {
            safeStopCandidates.Add(id);
        }

        var safeStops = new HashSet<int>();
        foreach (var nodeId in safeStopCandidates)
        {
            // Stopline nodes sit at corridor boundary — always safe waits.
            if (stoplineNodeIds.Contains(nodeId))
            {
                safeStops.Add(nodeId);
                holding.Add(nodeId);
                continue;
            }

            if (criticalNodeIds.Contains(nodeId))
            {
                issues.Add(new TrafficIssue(
                    SafeStopInCritical,
                    TrafficIssueSeverity.Error,
                    $"Candidate safe-stop node {nodeId} lies inside a critical/NO_STOP/junction resource.",
                    [$"node:{nodeId}"]));
                continue;
            }

            safeStops.Add(nodeId);
            holding.Add(nodeId);
        }

        var trafficNodes = route.Nodes
            .Select(n => new TrafficNode(
                n.Id,
                n.X,
                n.Y,
                [.. n.EndpointCodes],
                holding.Contains(n.Id) || safeStops.Contains(n.Id),
                stationNodeIds.Contains(n.Id),
                safeStops.Contains(n.Id)))
            .ToImmutableArray();

        BuildNodeConflictResources(trafficEdges, trafficNodes, resources);

        var (csrOffsets, csrEdgeIds) = BuildCsr(trafficNodes, trafficEdges);

        var sweptSegments = trafficEdges
            .Select(e =>
            {
                var a = nodesById[e.StartId];
                var b = nodesById[e.EndId];
                return (e.Id, a.X, a.Y, b.X, b.Y);
            })
            .ToList();
        var swept = SweptConflictIndex.Build(sweptSegments, footprint.TurnRadius);

        BuildPhysicalOverlapResources(trafficEdges, resources, swept, issues);
        ValidateOverlapSymmetry(trafficEdges, swept, issues);

        var edgeIdsImmutable = trafficEdges.ToImmutableArray();
        var resourcesImmutable = resources
            .GroupBy(r => r.Id, StringComparer.Ordinal)
            .Select(g => g.First())
            .OrderBy(r => r.Id, StringComparer.Ordinal)
            .ToImmutableArray();

        var resourcesByEdge = BuildResourcesByEdgeIndex(resourcesImmutable);
        var exitSafeStops = BuildExitSafeStops(
            resourcesImmutable, edgeIdsImmutable, trafficNodes, safeStops);

        foreach (var resource in resourcesImmutable.Where(IsCriticalKind))
        {
            if (!exitSafeStops.TryGetValue(resource.Id, out var exits) || exits.Length == 0)
            {
                issues.Add(new TrafficIssue(
                    CriticalNoExit,
                    TrafficIssueSeverity.Error,
                    $"Critical resource {resource.Id} has no reachable safe-stop exit.",
                    resource.RelatedCodes.Length > 0 ? resource.RelatedCodes.ToArray() : [resource.Id]));
            }
        }

        var graph = new CompiledTrafficGraph(
            route.Name,
            route.FrameId,
            graphHash,
            trafficNodes,
            edgeIdsImmutable,
            resourcesImmutable,
            corridors.ToImmutableArray(),
            stoplines.DistinctBy(s => (s.NodeId, s.CorridorId, s.EntryEdgeId)).ToImmutableArray(),
            stations.ToImmutableArray(),
            issues.ToImmutableArray(),
            csrOffsets,
            csrEdgeIds,
            footprint,
            route,
            swept,
            resourcesByEdge,
            exitSafeStops,
            safeStops.OrderBy(id => id).ToImmutableArray());

        return new TrafficCompileResult(graph, issues);
    }

    /// <summary>
    /// Bumped whenever RouteGraphBuilder / this compiler change node, edge or resource output for the same input,
    /// so a robot holding a graph file from an older build can never accept a grant (edge ids would differ).
    /// </summary>
    public const int CompilerVersion = 2;

    public static string ComputeGraphHash(TrafficCompileInput input, RouteGraphOptions? routeOptions = null)
    {
        var options = routeOptions ?? RouteGraphOptions.Default;
        var canonical = new
        {
            compilerVersion = CompilerVersion,
            routeOptions = new
            {
                vertexSnap = Round(options.VertexSnapTolerance),
                endpointSnap = Round(options.EndpointSnapDistance),
                junctionCapture = Round(options.JunctionCaptureDistance)
            },
            // Occupancy changes safe stops / holding nodes; a graph compiled without it must not share the hash.
            occupancy = input.Occupancy?.Fingerprint,
            stations = (input.StationMeta ?? [])
                .OrderBy(s => s.EndpointCode, StringComparer.Ordinal)
                .Select(s => new { s.EndpointCode, kind = s.BayKind.ToString() }),
            serviceStops = input.ServiceStopEndpointCodes?.Order(StringComparer.Ordinal).ToList(),
            recoveryStops = input.RecoveryEndpointCodes?.Order(StringComparer.Ordinal).ToList(),
            name = input.Name,
            frameId = input.FrameId,
            footprint = new
            {
                length = Round(input.Footprint.LengthMeters),
                width = Round(input.Footprint.WidthMeters),
                padding = Round(input.Footprint.PaddingMeters)
            },
            edges = input.Edges
                .OrderBy(e => e.Code, StringComparer.Ordinal)
                .Select(e => new
                {
                    e.Code,
                    direction = e.Direction.ToString(),
                    maxSpeed = e.MaxSpeed is { } s ? Round(s) : (double?)null,
                    e.IsActive,
                    points = e.Points.Select(p => new[] { Round(p.X), Round(p.Y) }).ToList()
                }),
            endpoints = input.Endpoints
                .OrderBy(e => e.Code, StringComparer.Ordinal)
                .Select(e => new { e.Code, x = Round(e.X), y = Round(e.Y), e.IsEnabled }),
            zones = input.Zones
                .OrderBy(z => z.Code, StringComparer.Ordinal)
                .Select(z => new
                {
                    z.Code,
                    type = z.ZoneType.ToString(),
                    maxSpeed = z.MaxSpeed is { } s ? Round(s) : (double?)null,
                    z.IsActive,
                    ring = z.Ring.Select(p => new[] { Round(p.X), Round(p.Y) }).ToList()
                }),
            lanes = input.LaneMeta
                .OrderBy(l => l.Code, StringComparer.Ordinal)
                .Select(l => new { l.Code, width = Round(l.WidthMeters), l.Capacity, direction = l.Direction.ToString() })
        };

        var json = JsonSerializer.Serialize(canonical, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        });
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static double Round(double v) => Math.Round(v, 6, MidpointRounding.AwayFromZero);

    private static void BuildLaneResources(
        List<TrafficEdge> edges,
        Dictionary<string, TrafficLaneMeta> laneMeta,
        List<TrafficResource> resources)
    {
        var byCode = edges
            .Where(e => e.EdgeCodes.Length > 0)
            .SelectMany(e => e.EdgeCodes.Select(c => (Code: c, Edge: e)))
            .GroupBy(x => x.Code, StringComparer.Ordinal);

        foreach (var group in byCode.OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            var capacity = laneMeta.TryGetValue(group.Key, out var meta) ? Math.Max(1, meta.Capacity) : 1;
            var edgeIds = group.Select(x => x.Edge.Id).Distinct().OrderBy(id => id).ToImmutableArray();
            resources.Add(new TrafficResource(
                $"lane:{group.Key}",
                TrafficResourceKind.Lane,
                capacity,
                edgeIds,
                [group.Key]));
        }
    }

    private static void BuildZoneResources(
        List<TrafficEdge> edges,
        IReadOnlyList<RouteGraphZoneInput> zones,
        Dictionary<string, TrafficZoneMeta> zoneMeta,
        List<TrafficResource> resources)
    {
        foreach (var zone in zones.Where(z => z.IsActive && z.ZoneType != ZoneType.KEEP_OUT)
                     .OrderBy(z => z.Code, StringComparer.Ordinal))
        {
            var edgeIds = edges
                .Where(e => e.ZoneCodes.Contains(zone.Code, StringComparer.Ordinal))
                .Select(e => e.Id)
                .OrderBy(id => id)
                .ToImmutableArray();
            if (edgeIds.Length == 0)
            {
                continue;
            }

            var capacity = zoneMeta.TryGetValue(zone.Code, out var meta)
                ? Math.Max(1, meta.Capacity)
                : zone.ZoneType is ZoneType.JUNCTION or ZoneType.SINGLE_OCCUPANCY ? 1 : 1;
            resources.Add(new TrafficResource(
                $"zone:{zone.Code}",
                TrafficResourceKind.Zone,
                capacity,
                edgeIds,
                [zone.Code]));
        }
    }

    private static void BuildJunctionConflictGroups(
        List<TrafficEdge> edges,
        IReadOnlyList<RouteGraphZoneInput> zones,
        Dictionary<string, TrafficZoneMeta> zoneMeta,
        List<TrafficResource> resources)
    {
        foreach (var zone in zones
                     .Where(z => z.IsActive && z.ZoneType is ZoneType.JUNCTION or ZoneType.SINGLE_OCCUPANCY or ZoneType.NO_STOP)
                     .OrderBy(z => z.Code, StringComparer.Ordinal))
        {
            // Restrict to edges that belong to THIS zone — never pull every IsJunction edge into every group.
            var edgeIds = edges
                .Where(e => e.ZoneCodes.Contains(zone.Code, StringComparer.Ordinal))
                .Select(e => e.Id)
                .Distinct()
                .OrderBy(id => id)
                .ToImmutableArray();
            if (edgeIds.Length == 0)
            {
                continue;
            }

            var capacity = zoneMeta.TryGetValue(zone.Code, out var meta) ? Math.Max(1, meta.Capacity) : 1;
            resources.Add(new TrafficResource(
                $"junction:{zone.Code}",
                TrafficResourceKind.JunctionConflict,
                capacity,
                edgeIds,
                [zone.Code]));
        }
    }

    /// <summary>
    /// One mutex per node where robots can meet: intersections (≥ 3 neighbours), safe stops and stations.
    /// Lanes are split at every crossing, so edges sharing only a vertex are otherwise never in conflict.
    /// </summary>
    private static void BuildNodeConflictResources(
        List<TrafficEdge> edges,
        ImmutableArray<TrafficNode> nodes,
        List<TrafficResource> resources)
    {
        foreach (var node in nodes.OrderBy(n => n.Id))
        {
            var incident = edges.Where(e => e.StartId == node.Id || e.EndId == node.Id).ToList();
            var neighbours = incident
                .Select(e => e.StartId == node.Id ? e.EndId : e.StartId)
                .Distinct()
                .Count();
            if (neighbours < 3 && !node.IsSafeStop && !node.IsStation)
            {
                continue;
            }

            resources.Add(new TrafficResource(
                $"node:{node.Id}",
                TrafficResourceKind.NodeConflict,
                1,
                incident.Select(e => e.Id).Distinct().OrderBy(id => id).ToImmutableArray(),
                [$"node:{node.Id}", .. node.EndpointCodes]));
        }
    }

    private static void BuildNarrowBidirectionalResources(
        List<TrafficEdge> edges,
        Dictionary<string, TrafficLaneMeta> laneMeta,
        List<TrafficResource> resources)
    {
        foreach (var group in edges
                     .Where(e => e.EdgeCodes.Length > 0 && !e.IsConnector)
                     .SelectMany(e => e.EdgeCodes.Select(c => (Code: c, Edge: e)))
                     .GroupBy(x => x.Code, StringComparer.Ordinal)
                     .OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            if (!laneMeta.TryGetValue(group.Key, out var meta) || meta.Direction != EdgeDirection.BIDIRECTIONAL)
            {
                continue;
            }

            // Both directions drive the same centre line, so opposing robots always collide whatever the lane
            // capacity: one robot at a time across both directions (same-direction convoys are not modelled).
            var edgeIds = group.Select(x => x.Edge.Id).Distinct().OrderBy(id => id).ToImmutableArray();
            if (edgeIds.Length < 2)
            {
                continue; // need both directions
            }

            resources.Add(new TrafficResource(
                $"narrow:{group.Key}",
                TrafficResourceKind.NarrowBidirectional,
                1,
                edgeIds,
                [group.Key]));
        }
    }

    private static void BuildPhysicalOverlapResources(
        List<TrafficEdge> edges,
        List<TrafficResource> resources,
        SweptConflictIndex swept,
        List<TrafficIssue> issues)
    {
        _ = issues;
        var edgeById = edges.ToDictionary(e => e.Id);
        var coveredPairs = new HashSet<(int, int)>();
        foreach (var resource in resources)
        {
            var ids = resource.EdgeIds.OrderBy(id => id).ToArray();
            for (var i = 0; i < ids.Length; i++)
            {
                for (var j = i + 1; j < ids.Length; j++)
                {
                    coveredPairs.Add((ids[i], ids[j]));
                }
            }
        }

        var emitted = new HashSet<string>(StringComparer.Ordinal);
        foreach (var edge in edges.OrderBy(e => e.Id))
        {
            foreach (var otherId in swept.ConflictsWith(edge.Id).Where(id => id > edge.Id))
            {
                if (!edgeById.ContainsKey(otherId))
                {
                    continue;
                }

                if (coveredPairs.Contains((edge.Id, otherId)))
                {
                    continue;
                }

                var id = $"overlap:{edge.Id}:{otherId}";
                if (!emitted.Add(id))
                {
                    continue;
                }

                resources.Add(new TrafficResource(
                    id,
                    TrafficResourceKind.PhysicalOverlap,
                    1,
                    ImmutableArray.Create(edge.Id, otherId),
                    [$"edge:{edge.Id}", $"edge:{otherId}"]));
            }
        }
    }

    private static void ValidateOverlapSymmetry(
        List<TrafficEdge> edges,
        SweptConflictIndex swept,
        List<TrafficIssue> issues)
    {
        foreach (var edge in edges)
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

    /// <summary>Resources that require a reachable safe-stop exit (occupancy corridors, not pairwise overlap locks).</summary>
    private static bool IsCriticalKind(TrafficResource r) =>
        r.Kind is TrafficResourceKind.JunctionConflict
            or TrafficResourceKind.CriticalCorridor
            or TrafficResourceKind.NarrowBidirectional;

    private static FrozenDictionary<int, ImmutableArray<string>> BuildResourcesByEdgeIndex(
        ImmutableArray<TrafficResource> resources)
    {
        var map = new Dictionary<int, List<string>>();
        foreach (var resource in resources)
        {
            foreach (var edgeId in resource.EdgeIds)
            {
                if (!map.TryGetValue(edgeId, out var list))
                {
                    list = [];
                    map[edgeId] = list;
                }

                list.Add(resource.Id);
            }
        }

        return map.ToFrozenDictionary(
            kv => kv.Key,
            kv => kv.Value.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToImmutableArray());
    }

    private static FrozenDictionary<string, ImmutableArray<int>> BuildExitSafeStops(
        ImmutableArray<TrafficResource> resources,
        ImmutableArray<TrafficEdge> edges,
        ImmutableArray<TrafficNode> nodes,
        HashSet<int> safeStops)
    {
        var edgeById = edges.ToFrozenDictionary(e => e.Id);
        var result = new Dictionary<string, ImmutableArray<int>>(StringComparer.Ordinal);

        foreach (var resource in resources)
        {
            var resourceEdges = resource.EdgeIds.ToHashSet();
            var boundaryNodes = new HashSet<int>();
            foreach (var edgeId in resource.EdgeIds)
            {
                if (!edgeById.TryGetValue(edgeId, out var edge))
                {
                    continue;
                }

                boundaryNodes.Add(edge.StartId);
                boundaryNodes.Add(edge.EndId);
            }

            var exits = new HashSet<int>();
            foreach (var nodeId in boundaryNodes)
            {
                // Boundary node that is itself a safe stop is always a valid exit/terminal.
                if (safeStops.Contains(nodeId))
                {
                    exits.Add(nodeId);
                }

                // External outgoing edges that leave the resource toward a safe stop.
                foreach (var edge in edges.Where(e => e.StartId == nodeId && !resourceEdges.Contains(e.Id)))
                {
                    if (safeStops.Contains(edge.EndId))
                    {
                        exits.Add(edge.EndId);
                    }
                }
            }

            result[resource.Id] = exits.OrderBy(id => id).ToImmutableArray();
        }

        _ = nodes;
        return result.ToFrozenDictionary(StringComparer.Ordinal);
    }

    private static IReadOnlySet<string> DeriveServiceStops(
        Dictionary<string, TrafficStationBayKind> stationMeta) =>
        stationMeta
            .Where(kv => kv.Value is TrafficStationBayKind.Service)
            .Select(kv => kv.Key)
            .ToHashSet(StringComparer.Ordinal);

    private static IReadOnlySet<string> DeriveRecoveryStops(
        Dictionary<string, TrafficStationBayKind> stationMeta) =>
        stationMeta
            .Where(kv => kv.Value is TrafficStationBayKind.Recovery or TrafficStationBayKind.Holding)
            .Select(kv => kv.Key)
            .ToHashSet(StringComparer.Ordinal);

    private static TrafficStationBayKind ResolveBayKind(
        string code,
        Dictionary<string, TrafficStationBayKind> stationMeta,
        IReadOnlySet<string> serviceStops,
        IReadOnlySet<string> recoveryStops)
    {
        if (stationMeta.TryGetValue(code, out var kind) && kind != TrafficStationBayKind.Unspecified)
        {
            return kind;
        }

        if (serviceStops.Contains(code))
        {
            return TrafficStationBayKind.Service;
        }

        if (recoveryStops.Contains(code))
        {
            return TrafficStationBayKind.Recovery;
        }

        return TrafficStationBayKind.Unspecified;
    }

    /// <summary>
    /// Corridors for visualization / stoplines. Junction conflict resources already own capacity —
    /// we still emit corridor metadata for stoplines but do NOT add duplicate CriticalCorridor resources
    /// for edges already in a JunctionConflict.
    /// </summary>
    private static (List<TrafficCorridor> Corridors, List<string> ResourceIds) BuildCriticalCorridors(
        List<TrafficEdge> edges,
        List<TrafficResource> resources)
    {
        var corridors = new List<TrafficCorridor>();
        var resourceIds = new List<string>();
        var critical = edges.Where(e => e.InCriticalCorridor).ToList();
        if (critical.Count == 0)
        {
            return (corridors, resourceIds);
        }

        var junctionCovered = resources
            .Where(r => r.Kind == TrafficResourceKind.JunctionConflict)
            .SelectMany(r => r.EdgeIds)
            .ToHashSet();

        var used = new HashSet<int>();
        var nextId = 1;

        // Emit corridor metadata (stoplines) for junction groups without duplicating capacity resources.
        foreach (var junction in resources
                     .Where(r => r.Kind == TrafficResourceKind.JunctionConflict)
                     .OrderBy(r => r.Id, StringComparer.Ordinal))
        {
            var edgeIds = junction.EdgeIds.Where(id => critical.Any(e => e.Id == id)).OrderBy(id => id).ToImmutableArray();
            if (edgeIds.Length == 0)
            {
                continue;
            }

            foreach (var id in edgeIds)
            {
                used.Add(id);
            }

            var entryNodes = edgeIds
                .Select(id => edges.First(e => e.Id == id).StartId)
                .Where(nid => !edgeIds.Any(eid => edges.First(e => e.Id == eid).EndId == nid))
                .Distinct()
                .OrderBy(id => id)
                .ToImmutableArray();

            // ResourceId points at the existing junction resource — no extra CriticalCorridor capacity.
            corridors.Add(new TrafficCorridor(nextId, junction.Id, edgeIds, entryNodes));
            nextId++;
        }

        // Remaining critical edges not in any junction → real CriticalCorridor resources.
        foreach (var edge in critical.Where(e => !used.Contains(e.Id) && !junctionCovered.Contains(e.Id)).OrderBy(e => e.Id))
        {
            var edgeIds = ImmutableArray.Create(edge.Id);
            var resourceId = $"corridor:{nextId}";
            corridors.Add(new TrafficCorridor(nextId, resourceId, edgeIds, ImmutableArray.Create(edge.StartId)));
            resourceIds.Add(resourceId);
            nextId++;
        }

        return (corridors, resourceIds);
    }

    private static (ImmutableArray<int> Offsets, ImmutableArray<int> EdgeIds) BuildCsr(
        ImmutableArray<TrafficNode> nodes,
        List<TrafficEdge> edges)
    {
        var indexById = nodes.Select((n, i) => (n.Id, i)).ToDictionary(x => x.Id, x => x.i);
        var outgoing = nodes.Select(_ => new List<int>()).ToArray();
        foreach (var edge in edges.OrderBy(e => e.StartId).ThenBy(e => e.Id))
        {
            if (indexById.TryGetValue(edge.StartId, out var idx))
            {
                outgoing[idx].Add(edge.Id);
            }
        }

        var offsets = new int[nodes.Length + 1];
        var flat = new List<int>();
        for (var i = 0; i < nodes.Length; i++)
        {
            offsets[i] = flat.Count;
            flat.AddRange(outgoing[i]);
        }

        offsets[nodes.Length] = flat.Count;
        return ([.. offsets], [.. flat]);
    }

    private static bool HasHeadingChange(
        int nodeId,
        List<TrafficEdge> edges,
        Dictionary<int, RouteGraphNode> nodes)
    {
        var incoming = edges.Where(e => e.EndId == nodeId).ToList();
        var outgoing = edges.Where(e => e.StartId == nodeId).ToList();
        if (incoming.Count == 0 || outgoing.Count == 0)
        {
            return false;
        }

        foreach (var inn in incoming)
        {
            var a = nodes[inn.StartId];
            var b = nodes[inn.EndId];
            var inAngle = Math.Atan2(b.Y - a.Y, b.X - a.X);
            foreach (var oute in outgoing)
            {
                if (oute.EndId == inn.StartId)
                {
                    continue; // reverse of same undirected lane
                }

                var c = nodes[oute.StartId];
                var d = nodes[oute.EndId];
                var outAngle = Math.Atan2(d.Y - c.Y, d.X - c.X);
                var delta = Math.Abs(NormalizeAngle(outAngle - inAngle));
                if (delta > Math.PI / 6) // > 30°
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static double NormalizeAngle(double a)
    {
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
    }

    private static double Square(double v) => v * v;
}
