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
        var graphHash = ComputeGraphHash(input);
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
        BuildZoneResources(trafficEdges, input.Zones, zoneMeta, resources);
        BuildJunctionConflictGroups(trafficEdges, input.Zones, zoneMeta, resources);

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

        var serviceStops = input.ServiceStopEndpointCodes ?? (IReadOnlySet<string>)new HashSet<string>(StringComparer.Ordinal);
        var recoveryStops = input.RecoveryEndpointCodes ?? (IReadOnlySet<string>)new HashSet<string>(StringComparer.Ordinal);

        var stations = new List<TrafficStation>();
        var stationNodeIds = new HashSet<int>();
        foreach (var node in route.Nodes.Where(n => n.EndpointCodes.Count > 0))
        {
            foreach (var code in node.EndpointCodes)
            {
                int? access = trafficEdges
                    .Where(e => e.IsConnector && (e.StartId == node.Id || e.EndId == node.Id))
                    .Select(e => (int?)e.Id)
                    .FirstOrDefault();
                stations.Add(new TrafficStation(
                    code,
                    node.Id,
                    access,
                    serviceStops.Contains(code),
                    recoveryStops.Contains(code)));
                stationNodeIds.Add(node.Id);
            }
        }

        var holding = new HashSet<int>();
        foreach (var node in route.Nodes)
        {
            var inCritical = trafficEdges.Any(e =>
                (e.StartId == node.Id || e.EndId == node.Id) && e.InCriticalCorridor);
            if (inCritical || stationNodeIds.Contains(node.Id))
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

        var trafficNodes = route.Nodes
            .Select(n => new TrafficNode(
                n.Id,
                n.X,
                n.Y,
                [.. n.EndpointCodes],
                holding.Contains(n.Id),
                stationNodeIds.Contains(n.Id)))
            .ToImmutableArray();

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

        var graph = new CompiledTrafficGraph(
            route.Name,
            route.FrameId,
            graphHash,
            trafficNodes,
            trafficEdges.ToImmutableArray(),
            resources.ToImmutableArray(),
            corridors.ToImmutableArray(),
            stoplines.DistinctBy(s => (s.NodeId, s.CorridorId, s.EntryEdgeId)).ToImmutableArray(),
            stations.ToImmutableArray(),
            issues.ToImmutableArray(),
            csrOffsets,
            csrEdgeIds,
            footprint,
            route,
            swept);

        return new TrafficCompileResult(graph, issues);
    }

    public static string ComputeGraphHash(TrafficCompileInput input)
    {
        var canonical = new
        {
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
            var edgeIds = edges
                .Where(e => e.IsJunction || e.ZoneCodes.Contains(zone.Code, StringComparer.Ordinal) ||
                            (zone.ZoneType == ZoneType.NO_STOP && e.NoStop) ||
                            (zone.ZoneType != ZoneType.NO_STOP && e.SingleOccupancy &&
                             e.ZoneCodes.Contains(zone.Code, StringComparer.Ordinal)))
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

        // One corridor per junction conflict group (edges already grouped).
        var junctionResources = resources
            .Where(r => r.Kind == TrafficResourceKind.JunctionConflict)
            .OrderBy(r => r.Id, StringComparer.Ordinal)
            .ToList();

        var used = new HashSet<int>();
        var nextId = 1;
        foreach (var junction in junctionResources)
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

            var resourceId = $"corridor:{nextId}";
            corridors.Add(new TrafficCorridor(nextId, resourceId, edgeIds, entryNodes));
            resourceIds.Add(resourceId);
            nextId++;
        }

        // Remaining critical edges (e.g. labeled without matching zone resource) → singleton corridors.
        foreach (var edge in critical.Where(e => !used.Contains(e.Id)).OrderBy(e => e.Id))
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
