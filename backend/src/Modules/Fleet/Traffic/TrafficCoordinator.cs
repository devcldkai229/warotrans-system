using System.Collections.Immutable;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Thread-safe singleton coordinator: atomic multi-resource locks with FIFO waiters.
/// </summary>
public sealed class TrafficCoordinator : ITrafficCoordinator
{
    private readonly object _gate = new();

    // resourceId → holders (robot ids); capacity checked against graph resource definition at acquire time
    private readonly Dictionary<string, HashSet<Guid>> _holders = new(StringComparer.Ordinal);

    // robotId → active grant
    private readonly Dictionary<Guid, ActiveGrant> _grantsByRobot = new();

    // FIFO wait queue
    private readonly LinkedList<WaitEntry> _waitQueue = new();

    private readonly List<ReadyNavigateGrant> _ready = [];

    public RouteGrantResult TryAcquireRouteGrant(
        Guid robotId,
        Guid mapVersionId,
        CompiledTrafficGraph graph,
        int startNodeId,
        int goalNodeId,
        Guid jobStepId,
        PendingNavigateContext? pendingNavigate = null)
    {
        ArgumentNullException.ThrowIfNull(graph);

        var path = graph.ShortestPath(startNodeId, goalNodeId);
        if (path is null)
        {
            return RouteGrantResult.Failed();
        }

        var edgeIds = path.ToImmutableArray();
        var resources = ResourcesCovering(graph, edgeIds);

        lock (_gate)
        {
            // Replacing an existing grant / wait for this robot (e.g. resume).
            RemoveWaiterLocked(robotId);
            if (_grantsByRobot.ContainsKey(robotId))
            {
                ReleaseLocked(robotId, promote: false);
            }

            if (CanAcquireLocked(resources))
            {
                AcquireLocked(robotId, mapVersionId, graph.GraphHash, jobStepId, edgeIds, resources);
                return RouteGrantResult.Immediate(graph.GraphHash, edgeIds);
            }

            _waitQueue.AddLast(new WaitEntry(
                robotId,
                mapVersionId,
                graph.GraphHash,
                jobStepId,
                edgeIds,
                resources.Select(r => (r.Id, r.Capacity)).ToImmutableArray(),
                pendingNavigate));

            return RouteGrantResult.Queued(graph.GraphHash, edgeIds);
        }
    }

    public void ReleaseGrant(Guid robotId)
    {
        lock (_gate)
        {
            RemoveWaiterLocked(robotId);
            if (_grantsByRobot.ContainsKey(robotId))
            {
                ReleaseLocked(robotId, promote: true);
            }
            else
            {
                PromoteWaitersLocked();
            }
        }
    }

    public void ReleaseByJobStep(Guid jobStepId)
    {
        lock (_gate)
        {
            RemoveWaiterByJobStepLocked(jobStepId);

            Guid? robotId = null;
            foreach (var (rid, grant) in _grantsByRobot)
            {
                if (grant.JobStepId == jobStepId)
                {
                    robotId = rid;
                    break;
                }
            }

            if (robotId is { } id)
            {
                ReleaseLocked(id, promote: true);
            }
            else
            {
                PromoteWaitersLocked();
            }
        }
    }

    public void ReleaseAllForOfflineRobot(Guid robotId) => ReleaseGrant(robotId);

    public IReadOnlyList<ReadyNavigateGrant> TakeReadyNavigates()
    {
        lock (_gate)
        {
            if (_ready.Count == 0)
            {
                return Array.Empty<ReadyNavigateGrant>();
            }

            var batch = _ready.ToArray();
            _ready.Clear();
            return batch;
        }
    }

    private static ImmutableArray<TrafficResource> ResourcesCovering(
        CompiledTrafficGraph graph,
        ImmutableArray<int> edgeIds)
    {
        if (edgeIds.Length == 0)
        {
            return ImmutableArray<TrafficResource>.Empty;
        }

        var edgeSet = edgeIds.ToHashSet();
        return graph.Resources
            .Where(r => r.EdgeIds.Any(edgeSet.Contains))
            .ToImmutableArray();
    }

    private bool CanAcquireLocked(ImmutableArray<TrafficResource> resources)
    {
        foreach (var resource in resources)
        {
            if (!_holders.TryGetValue(resource.Id, out var set))
            {
                continue;
            }

            if (set.Count >= resource.Capacity)
            {
                return false;
            }
        }

        return true;
    }

    private void AcquireLocked(
        Guid robotId,
        Guid mapVersionId,
        string graphHash,
        Guid jobStepId,
        ImmutableArray<int> edgeIds,
        ImmutableArray<TrafficResource> resources)
    {
        var resourceIds = new List<string>(resources.Length);
        foreach (var resource in resources)
        {
            if (!_holders.TryGetValue(resource.Id, out var set))
            {
                set = [];
                _holders[resource.Id] = set;
            }

            set.Add(robotId);
            resourceIds.Add(resource.Id);
        }

        _grantsByRobot[robotId] = new ActiveGrant(
            mapVersionId,
            graphHash,
            jobStepId,
            edgeIds,
            resourceIds.ToImmutableArray());
    }

    private void ReleaseLocked(Guid robotId, bool promote)
    {
        if (!_grantsByRobot.Remove(robotId, out var grant))
        {
            if (promote)
            {
                PromoteWaitersLocked();
            }

            return;
        }

        foreach (var resourceId in grant.ResourceIds)
        {
            if (!_holders.TryGetValue(resourceId, out var set))
            {
                continue;
            }

            set.Remove(robotId);
            if (set.Count == 0)
            {
                _holders.Remove(resourceId);
            }
        }

        if (promote)
        {
            PromoteWaitersLocked();
        }
    }

    private void PromoteWaitersLocked()
    {
        var node = _waitQueue.First;
        while (node is not null)
        {
            var next = node.Next;
            var wait = node.Value;
            if (CanAcquireFromCapacitiesLocked(wait.Resources))
            {
                _waitQueue.Remove(node);
                AcquireFromIdsLocked(
                    wait.RobotId,
                    wait.MapVersionId,
                    wait.GraphHash,
                    wait.JobStepId,
                    wait.EdgeIds,
                    wait.Resources);

                if (wait.PendingNavigate is { } pending)
                {
                    _ready.Add(new ReadyNavigateGrant(
                        wait.RobotId,
                        pending.JobId,
                        wait.JobStepId,
                        pending.X,
                        pending.Y,
                        pending.Yaw,
                        pending.FrameId,
                        wait.GraphHash,
                        wait.EdgeIds));
                }
            }

            node = next;
        }
    }

    private bool CanAcquireFromCapacitiesLocked(ImmutableArray<(string Id, int Capacity)> resources)
    {
        foreach (var (id, capacity) in resources)
        {
            if (!_holders.TryGetValue(id, out var set))
            {
                continue;
            }

            if (set.Count >= capacity)
            {
                return false;
            }
        }

        return true;
    }

    private void AcquireFromIdsLocked(
        Guid robotId,
        Guid mapVersionId,
        string graphHash,
        Guid jobStepId,
        ImmutableArray<int> edgeIds,
        ImmutableArray<(string Id, int Capacity)> resources)
    {
        var resourceIds = new List<string>(resources.Length);
        foreach (var (id, _) in resources)
        {
            if (!_holders.TryGetValue(id, out var set))
            {
                set = [];
                _holders[id] = set;
            }

            set.Add(robotId);
            resourceIds.Add(id);
        }

        _grantsByRobot[robotId] = new ActiveGrant(
            mapVersionId,
            graphHash,
            jobStepId,
            edgeIds,
            resourceIds.ToImmutableArray());
    }

    private void RemoveWaiterLocked(Guid robotId)
    {
        var node = _waitQueue.First;
        while (node is not null)
        {
            var next = node.Next;
            if (node.Value.RobotId == robotId)
            {
                _waitQueue.Remove(node);
            }

            node = next;
        }
    }

    private void RemoveWaiterByJobStepLocked(Guid jobStepId)
    {
        var node = _waitQueue.First;
        while (node is not null)
        {
            var next = node.Next;
            if (node.Value.JobStepId == jobStepId)
            {
                _waitQueue.Remove(node);
            }

            node = next;
        }
    }

    private sealed record ActiveGrant(
        Guid MapVersionId,
        string GraphHash,
        Guid JobStepId,
        ImmutableArray<int> EdgeIds,
        ImmutableArray<string> ResourceIds);

    private sealed record WaitEntry(
        Guid RobotId,
        Guid MapVersionId,
        string GraphHash,
        Guid JobStepId,
        ImmutableArray<int> EdgeIds,
        ImmutableArray<(string Id, int Capacity)> Resources,
        PendingNavigateContext? PendingNavigate);
}
