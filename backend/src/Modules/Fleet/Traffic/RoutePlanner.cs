using System.Collections.Immutable;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Deterministic route planner over a compiled traffic graph. Runs off the actor critical path.
/// Caches only immutable structures keyed by GraphHash.
/// </summary>
public sealed class RoutePlanner
{
    private readonly double _hysteresisRatio;
    private readonly object _cacheGate = new();
    private readonly Dictionary<string, ImmutableCache> _cache = new(StringComparer.Ordinal);

    public RoutePlanner(TrafficOptions? options = null)
    {
        _hysteresisRatio = options?.HysteresisRatio ?? 0.15;
    }

    public RoutePlanResult Plan(
        RoutePlanRequest request,
        IReadOnlyDictionary<string, int>? congestionByResource = null,
        long stateVersion = 0,
        IReadOnlyList<int>? previousFullPath = null,
        double? previousCost = null)
    {
        ArgumentNullException.ThrowIfNull(request);
        var graph = request.Graph;

        var startNode = NearestNode(graph, request.PoseX, request.PoseY);
        if (startNode is null)
        {
            return RoutePlanResult.Unreachable("NO_NEAR_NODE");
        }

        var goalNodeId = ResolveGoal(graph, request.GoalEndpointCode, request.GoalNodeId);
        if (goalNodeId is null)
        {
            return RoutePlanResult.Unreachable("GOAL_UNKNOWN");
        }

        var costFn = BuildCost(graph, congestionByResource);
        var path = Search(graph, startNode.Value, goalNodeId.Value, costFn, turnPenalty: 0.3);
        if (path is null)
        {
            return RoutePlanResult.Unreachable("UNREACHABLE");
        }

        var cost = PathCost(graph, path, costFn);
        if (previousFullPath is not null && previousCost is not null)
        {
            // Hysteresis: keep previous unless new is sufficiently cheaper.
            if (cost > previousCost.Value * (1.0 - _hysteresisRatio) - 1e-9)
            {
                path = previousFullPath.ToImmutableArray();
                cost = previousCost.Value;
            }
        }

        var alt = FindAlternative(graph, startNode.Value, goalNodeId.Value, path, costFn);
        var segments = SegmentSafeStops(graph, path, request, stateVersion, cost);

        ImmutableArray<ImmutableArray<int>> alternatives = alt is null
            ? ImmutableArray<ImmutableArray<int>>.Empty
            : ImmutableArray.Create(alt.Value);

        return RoutePlanResult.OkPlan(path.ToImmutableArray(), segments, alternatives);
    }

    public ImmutableArray<RouteSegmentCandidate> SegmentSafeStops(
        CompiledTrafficGraph graph,
        IReadOnlyList<int> fullEdgeIds,
        RoutePlanRequest request,
        long stateVersion,
        double totalCost)
    {
        if (fullEdgeIds.Count == 0)
        {
            var node = NearestNode(graph, request.PoseX, request.PoseY) ?? 0;
            return
            [
                new RouteSegmentCandidate(
                    request.RequestId,
                    request.RobotId,
                    request.MapVersionId,
                    graph.GraphHash,
                    node,
                    node,
                    [],
                    [],
                    [],
                    0,
                    stateVersion,
                    request.Priority,
                    request.JobStepId,
                    request.JobId)
            ];
        }

        var nodes = new List<int> { graph.EdgeById[fullEdgeIds[0]].StartId };
        foreach (var edgeId in fullEdgeIds)
        {
            nodes.Add(graph.EdgeById[edgeId].EndId);
        }

        // Segment boundaries at safe stops (including start/goal).
        var boundaryIndexes = new List<int> { 0 };
        for (var i = 1; i < nodes.Count - 1; i++)
        {
            if (graph.IsSafeStop(nodes[i]))
            {
                boundaryIndexes.Add(i);
            }
        }

        boundaryIndexes.Add(nodes.Count - 1);

        var segments = new List<RouteSegmentCandidate>();
        for (var s = 0; s < boundaryIndexes.Count - 1; s++)
        {
            var fromIdx = boundaryIndexes[s];
            var toIdx = boundaryIndexes[s + 1];
            if (fromIdx == toIdx)
            {
                continue;
            }

            var edgeSlice = fullEdgeIds.Skip(fromIdx).Take(toIdx - fromIdx).ToImmutableArray();
            var resources = graph.ResourcesCovering(edgeSlice);
            var exitStops = resources
                .SelectMany(rid =>
                    graph.ExitSafeStopsByResourceId.TryGetValue(rid, out var exits)
                        ? exits
                        : [])
                .Distinct()
                .OrderBy(id => id)
                .ToImmutableArray();

            // Always reserve the segment goal as an exit.
            if (!exitStops.Contains(nodes[toIdx]))
            {
                exitStops = exitStops.Add(nodes[toIdx]);
            }

            segments.Add(new RouteSegmentCandidate(
                request.RequestId,
                request.RobotId,
                request.MapVersionId,
                graph.GraphHash,
                nodes[fromIdx],
                nodes[toIdx],
                edgeSlice,
                resources,
                exitStops,
                totalCost / Math.Max(1, boundaryIndexes.Count - 1),
                stateVersion,
                request.Priority,
                request.JobStepId,
                request.JobId));
        }

        return segments.ToImmutableArray();
    }

    private ImmutableArray<int>? FindAlternative(
        CompiledTrafficGraph graph,
        int start,
        int goal,
        IReadOnlyList<int> primary,
        Func<TrafficEdge, double> costFn)
    {
        if (primary.Count == 0)
        {
            return null;
        }

        // Penalize primary edges and re-search.
        var penalized = primary.ToHashSet();
        double AltCost(TrafficEdge e) => costFn(e) + (penalized.Contains(e.Id) ? 1e3 : 0);
        var alt = Search(graph, start, goal, AltCost, turnPenalty: 0.3);
        if (alt is null || alt.SequenceEqual(primary))
        {
            return null;
        }

        return alt.ToImmutableArray();
    }

    private static Func<TrafficEdge, double> BuildCost(
        CompiledTrafficGraph graph,
        IReadOnlyDictionary<string, int>? congestion)
    {
        return edge =>
        {
            var c = Math.Max(edge.LengthMeters, 1e-6);
            if (edge.AbsSpeedLimit is { } lim && lim > 1e-6)
            {
                c *= 1.0 + (1.0 / lim);
            }

            if (congestion is not null &&
                graph.ResourcesByEdgeId.TryGetValue(edge.Id, out var rids))
            {
                foreach (var rid in rids)
                {
                    if (congestion.TryGetValue(rid, out var holders) && holders > 0)
                    {
                        c += holders * 2.0;
                    }
                }
            }

            return c;
        };
    }

    private static double PathCost(
        CompiledTrafficGraph graph,
        IReadOnlyList<int> edgeIds,
        Func<TrafficEdge, double> costFn)
    {
        double sum = 0;
        foreach (var id in edgeIds)
        {
            sum += costFn(graph.EdgeById[id]);
        }

        return sum;
    }

    private ImmutableCache GetCache(CompiledTrafficGraph graph)
    {
        lock (_cacheGate)
        {
            if (_cache.TryGetValue(graph.GraphHash, out var hit))
            {
                return hit;
            }

            var created = new ImmutableCache(graph.GraphHash);
            _cache[graph.GraphHash] = created;
            return created;
        }
    }

    /// <summary>A* with Euclidean heuristic; deterministic tie-break on edge id.</summary>
    public static IReadOnlyList<int>? Search(
        CompiledTrafficGraph graph,
        int startNodeId,
        int goalNodeId,
        Func<TrafficEdge, double> costFn,
        double turnPenalty)
    {
        _ = turnPenalty;
        if (!graph.NodeById.ContainsKey(startNodeId) || !graph.NodeById.ContainsKey(goalNodeId))
        {
            return null;
        }

        if (startNodeId == goalNodeId)
        {
            return [];
        }

        var goal = graph.NodeById[goalNodeId];
        double Heuristic(int nodeId)
        {
            var n = graph.NodeById[nodeId];
            var dx = n.X - goal.X;
            var dy = n.Y - goal.Y;
            return Math.Sqrt(dx * dx + dy * dy);
        }

        var gScore = new Dictionary<int, double> { [startNodeId] = 0 };
        var prev = new Dictionary<int, (int NodeId, int EdgeId)>();
        var open = new SortedSet<(double F, int EdgeId, int NodeId)>(
            Comparer<(double F, int EdgeId, int NodeId)>.Create((a, b) =>
            {
                var c = a.F.CompareTo(b.F);
                if (c != 0) return c;
                c = a.EdgeId.CompareTo(b.EdgeId);
                if (c != 0) return c;
                return a.NodeId.CompareTo(b.NodeId);
            }));

        open.Add((Heuristic(startNodeId), 0, startNodeId));

        while (open.Count > 0)
        {
            var (_, _, u) = open.Min;
            open.Remove(open.Min);
            if (u == goalNodeId)
            {
                break;
            }

            var gu = gScore[u];
            foreach (var (edgeId, edge) in graph.Outgoing(u))
            {
                var tentative = gu + costFn(edge);
                if (!gScore.TryGetValue(edge.EndId, out var known) || tentative < known - 1e-12 ||
                    (Math.Abs(tentative - known) <= 1e-12 &&
                     (!prev.TryGetValue(edge.EndId, out var p) || edgeId < p.EdgeId)))
                {
                    gScore[edge.EndId] = tentative;
                    prev[edge.EndId] = (u, edgeId);
                    open.Add((tentative + Heuristic(edge.EndId), edgeId, edge.EndId));
                }
            }
        }

        if (!prev.ContainsKey(goalNodeId))
        {
            return null;
        }

        var path = new List<int>();
        for (var cur = goalNodeId; cur != startNodeId; cur = prev[cur].NodeId)
        {
            path.Add(prev[cur].EdgeId);
        }

        path.Reverse();
        return path;
    }

    public static int? NearestNode(CompiledTrafficGraph graph, double x, double y)
    {
        int? best = null;
        var bestD = double.PositiveInfinity;
        foreach (var node in graph.Nodes)
        {
            var dx = node.X - x;
            var dy = node.Y - y;
            var d = dx * dx + dy * dy;
            if (d < bestD - 1e-18 || (Math.Abs(d - bestD) <= 1e-18 && (best is null || node.Id < best)))
            {
                bestD = d;
                best = node.Id;
            }
        }

        return best;
    }

    private static int? ResolveGoal(
        CompiledTrafficGraph graph,
        string? endpointCode,
        int? goalNodeId)
    {
        if (goalNodeId is int nid && graph.NodeById.ContainsKey(nid))
        {
            return nid;
        }

        if (!string.IsNullOrWhiteSpace(endpointCode))
        {
            var station = graph.Stations.FirstOrDefault(s =>
                string.Equals(s.EndpointCode, endpointCode, StringComparison.Ordinal));
            if (station is not null)
            {
                return station.NodeId;
            }

            var node = graph.Nodes.FirstOrDefault(n =>
                n.EndpointCodes.Contains(endpointCode, StringComparer.Ordinal));
            if (node is not null)
            {
                return node.Id;
            }
        }

        return null;
    }

    private sealed class ImmutableCache(string graphHash)
    {
        public string GraphHash { get; } = graphHash;
    }
}
