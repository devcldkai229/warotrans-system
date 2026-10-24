using System.Collections.Immutable;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Pure in-memory traffic state machine. No IO. Driven by a single-writer actor or tests.
/// </summary>
public sealed class TrafficState
{
    private readonly TrafficOptions _options;
    private readonly TimeProvider _clock;
    private readonly Dictionary<Guid, RobotRuntime> _robots = new();
    private readonly Dictionary<string, HashSet<Guid>> _holders = new(StringComparer.Ordinal);
    private readonly Dictionary<string, List<Waiter>> _queues = new(StringComparer.Ordinal);
    private readonly Dictionary<Guid, AcquireResult> _idempotency = new();
    private readonly Queue<string> _events;
    private readonly int _eventCap;
    private CompiledTrafficGraph? _graph;
    private Guid _mapVersionId;
    private long _enqueueSeq;
    private bool _ready;

    public TrafficState(TrafficOptions options, TimeProvider? clock = null)
    {
        _options = options;
        _clock = clock ?? TimeProvider.System;
        _eventCap = Math.Max(16, options.EventLogCapacity);
        _events = new Queue<string>(_eventCap);
        Epoch = 1;
        Phase = "Reconciling";
    }

    public long Epoch { get; private set; }
    public long StateVersion { get; private set; }
    public string Phase { get; private set; }
    public CompiledTrafficGraph? Graph => _graph;

    public void BeginEpoch(long? forcedEpoch = null)
    {
        Epoch = forcedEpoch ?? Epoch + 1;
        Phase = "Reconciling";
        _ready = false;
        _robots.Clear();
        _holders.Clear();
        _queues.Clear();
        _idempotency.Clear();
        StateVersion++;
        Log($"epoch:{Epoch}:reconciling");
    }

    public void BindGraph(Guid mapVersionId, CompiledTrafficGraph graph)
    {
        _mapVersionId = mapVersionId;
        _graph = graph;
        StateVersion++;
    }

    public void CompleteReconciliation(IReadOnlyList<TrafficReconcileSeed> seeds)
    {
        if (_graph is null)
        {
            Phase = "Ready";
            _ready = true;
            StateVersion++;
            Log("reconcile:empty-graph");
            return;
        }

        foreach (var seed in seeds.OrderBy(s => s.RobotId))
        {
            var robot = GetOrCreate(seed.RobotId);
            robot.JobStepId = seed.JobStepId;
            robot.LocalizationOk = seed.LocalizationOk;
            robot.X = seed.PoseX;
            robot.Y = seed.PoseY;

            if (!seed.PoseKnown || !seed.LocalizationOk || seed.OccupiedEdgeIds.Length == 0)
            {
                Quarantine(robot, "RECONCILE_UNCERTAIN");
                continue;
            }

            var resources = _graph.ResourcesCovering(seed.OccupiedEdgeIds);
            if (!TryOccupy(robot, resources, out var reason))
            {
                Quarantine(robot, reason ?? "RECONCILE_CONFLICT");
                continue;
            }

            robot.Phase = TrafficRobotPhase.Idle;
            robot.NodeId = RoutePlanner.NearestNode(_graph, seed.PoseX ?? 0, seed.PoseY ?? 0);
            Log($"reconcile:ok:{robot.RobotId}");
        }

        Phase = "Ready";
        _ready = true;
        StateVersion++;
        Log("reconcile:complete");
    }

    public AcquireResult AcquireAtomic(RouteSegmentCandidate candidate, long? clientEpoch, long? clientSeq)
    {
        if (_idempotency.TryGetValue(candidate.RequestId, out var cached))
        {
            return cached;
        }

        if (!_ready || Phase != "Ready")
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("RECONCILING", TrafficWaitingReason.Reconciling));
        }

        if (_graph is null || !string.Equals(_graph.GraphHash, candidate.GraphHash, StringComparison.Ordinal))
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("GRAPH_MISMATCH"));
        }

        if (clientEpoch is long e && e != Epoch)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("STALE_EPOCH"));
        }

        var robot = GetOrCreate(candidate.RobotId);
        if (robot.Phase == TrafficRobotPhase.Quarantined)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("QUARANTINED", TrafficWaitingReason.QuarantinedPeer));
        }

        if (clientSeq is long seq && seq < robot.LastSeq)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("STALE_SEQ"));
        }

        // No hold-and-wait: may only hold current occupancy + one new segment.
        if (robot.Authority is not null)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("AUTHORITY_ALREADY_HELD"));
        }

        // Shadow: at most one concurrent mover.
        if (_options.Mode == TrafficCoordinatorMode.Shadow)
        {
            var movers = _robots.Values.Count(r =>
                r.RobotId != robot.RobotId &&
                r.Phase is TrafficRobotPhase.Authorized or TrafficRobotPhase.Moving);
            if (movers > 0)
            {
                Enqueue(robot, candidate, TrafficWaitingReason.ShadowSingleMover, FindAnyMover());
                return Cache(candidate.RequestId,
                    AcquireResult.Queue(TrafficWaitingReason.ShadowSingleMover, FindAnyMover(), "SHADOW_SINGLE_MOVER"));
            }
        }

        if (WouldCreateWaitForCycle(robot.RobotId, candidate.ResourceIds))
        {
            Log($"deadlock-reject:{robot.RobotId}");
            return Cache(candidate.RequestId, AcquireResult.Reject("DEADLOCK_RISK", TrafficWaitingReason.DeadlockRisk));
        }

        if (!CanAcquire(candidate.ResourceIds, robot.RobotId, out var blocker, out var waitReason))
        {
            Enqueue(robot, candidate, waitReason, blocker);
            return Cache(candidate.RequestId, AcquireResult.Queue(waitReason, blocker));
        }

        // Exit reservation: segment goal / exits must be free or held by this robot.
        if (!ReserveExits(candidate.ExitSafeStops, robot.RobotId, out var exitBlocker))
        {
            Enqueue(robot, candidate, TrafficWaitingReason.ExitBlocked, exitBlocker);
            return Cache(candidate.RequestId,
                AcquireResult.Queue(TrafficWaitingReason.ExitBlocked, exitBlocker, "EXIT_BLOCKED"));
        }

        Occupy(robot, candidate.ResourceIds);
        robot.LastSeq = Math.Max(robot.LastSeq + 1, clientSeq ?? robot.LastSeq + 1);
        var authority = new MotionAuthority(
            Guid.NewGuid(),
            robot.RobotId,
            candidate.StartSafeStopNodeId,
            candidate.GoalSafeStopNodeId,
            candidate.EdgeIds,
            candidate.ResourceIds,
            candidate.ExitSafeStops,
            robot.LastSeq,
            Epoch,
            candidate.GraphHash);
        robot.Authority = authority;
        robot.Phase = TrafficRobotPhase.Authorized;
        robot.JobStepId = candidate.JobStepId;
        robot.WaitingReason = TrafficWaitingReason.None;
        robot.BlockingOwner = null;
        RemoveFromAllQueues(robot.RobotId);
        StateVersion++;
        Log($"grant:{robot.RobotId}:auth:{authority.AuthorityId}");
        return Cache(candidate.RequestId, AcquireResult.Grant(authority));
    }

    public TrafficOpResult ReportProgress(Guid robotId, long seq, long epoch, int? nodeId, double? x, double? y, bool localizationOk)
    {
        if (epoch != Epoch)
        {
            return TrafficOpResult.Fail("STALE_EPOCH");
        }

        var robot = GetOrCreate(robotId);
        if (seq < robot.LastSeq)
        {
            return TrafficOpResult.Fail("STALE_SEQ"); // out-of-order ignored (idempotent reject)
        }

        robot.LastSeq = seq;
        robot.NodeId = nodeId ?? robot.NodeId;
        robot.X = x ?? robot.X;
        robot.Y = y ?? robot.Y;
        robot.LocalizationOk = localizationOk;
        if (!localizationOk)
        {
            Quarantine(robot, "LOCALIZATION_LOSS");
            return TrafficOpResult.Success();
        }

        if (robot.Authority is not null)
        {
            robot.Phase = TrafficRobotPhase.Moving;
        }

        StateVersion++;
        return TrafficOpResult.Success();
    }

    public TrafficOpResult ReportVerifiedExit(
        Guid robotId,
        long seq,
        long epoch,
        ImmutableArray<string> resourceIds,
        double poseX,
        double poseY,
        bool localizationOk)
    {
        if (epoch != Epoch)
        {
            return TrafficOpResult.Fail("STALE_EPOCH");
        }

        var robot = GetOrCreate(robotId);
        if (seq < robot.LastSeq)
        {
            return TrafficOpResult.Fail("STALE_SEQ");
        }

        if (!localizationOk || _graph is null)
        {
            Quarantine(robot, "EXIT_UNCERTAIN");
            return TrafficOpResult.Fail("EXIT_UNCERTAIN");
        }

        robot.LastSeq = seq;
        robot.X = poseX;
        robot.Y = poseY;
        robot.LocalizationOk = true;

        foreach (var rid in resourceIds)
        {
            if (!robot.OccupiedResourceIds.Contains(rid))
            {
                continue;
            }

            if (!IsPhysicallyClear(robot, rid, poseX, poseY))
            {
                return TrafficOpResult.Fail("NOT_CLEARED");
            }
        }

        foreach (var rid in resourceIds)
        {
            ReleaseResource(robot, rid);
        }

        // Clear authority when all granted resources released.
        if (robot.Authority is { } auth &&
            auth.ResourceIds.All(rid => !robot.OccupiedResourceIds.Contains(rid)))
        {
            robot.Authority = null;
            robot.Phase = TrafficRobotPhase.Idle;
        }

        StateVersion++;
        PromoteWaiters(resourceIds);
        Log($"exit:{robotId}:{string.Join(",", resourceIds)}");
        return TrafficOpResult.Success();
    }

    public TrafficOpResult HoldServiceResource(Guid robotId, string resourceId)
    {
        var robot = GetOrCreate(robotId);
        if (robot.Phase == TrafficRobotPhase.Quarantined)
        {
            return TrafficOpResult.Fail("QUARANTINED");
        }

        if (!robot.OccupiedResourceIds.Contains(resourceId))
        {
            if (!TryOccupy(robot, [resourceId], out var reason))
            {
                return TrafficOpResult.Fail(reason ?? "CAPACITY");
            }
        }

        robot.Phase = TrafficRobotPhase.HoldingService;
        StateVersion++;
        Log($"hold-service:{robotId}:{resourceId}");
        return TrafficOpResult.Success();
    }

    public TrafficOpResult ReleaseAfterPhysicalClearance(Guid robotId, string? operatorId, ImmutableArray<string>? resourceIds)
    {
        if (string.IsNullOrWhiteSpace(operatorId))
        {
            return TrafficOpResult.Fail("OPERATOR_REQUIRED");
        }

        var robot = GetOrCreate(robotId);
        var targets = resourceIds is { Length: > 0 }
            ? resourceIds.Value
            : robot.OccupiedResourceIds.ToImmutableArray();

        foreach (var rid in targets)
        {
            ReleaseResource(robot, rid);
        }

        robot.Authority = null;
        robot.Phase = TrafficRobotPhase.Idle;
        robot.QuarantineReason = null;
        StateVersion++;
        PromoteWaiters(targets);
        Log($"op-release:{robotId}:by:{operatorId}");
        return TrafficOpResult.Success();
    }

    public TrafficOpResult CancelRequest(Guid robotId, Guid? requestId)
    {
        if (requestId is Guid rid)
        {
            _idempotency.Remove(rid);
        }

        var robot = GetOrCreate(robotId);
        RemoveFromAllQueues(robotId);
        // Cancel does NOT release occupancy — uncertain until verified exit / operator.
        if (robot.OccupiedResourceIds.Count > 0 || robot.Authority is not null)
        {
            Quarantine(robot, "CANCEL_WHILE_OCCUPIED");
        }
        else
        {
            robot.Phase = TrafficRobotPhase.Idle;
            robot.Authority = null;
        }

        StateVersion++;
        Log($"cancel:{robotId}");
        return TrafficOpResult.Success();
    }

    public TrafficOpResult MarkBlocked(Guid robotId, string reason)
    {
        var robot = GetOrCreate(robotId);
        Quarantine(robot, $"BLOCKED:{reason}");
        return TrafficOpResult.Success();
    }

    public TrafficOpResult MarkOffline(Guid robotId)
    {
        var robot = GetOrCreate(robotId);
        Quarantine(robot, "OFFLINE");
        return TrafficOpResult.Success();
    }

    public TrafficOpResult ReconcileRobot(Guid robotId, double poseX, double poseY, bool localizationOk, ImmutableArray<int> occupiedEdges)
    {
        if (_graph is null)
        {
            return TrafficOpResult.Fail("NO_GRAPH");
        }

        var robot = GetOrCreate(robotId);
        if (!localizationOk)
        {
            Quarantine(robot, "RECONCILE_LOCALIZATION");
            return TrafficOpResult.Fail("LOCALIZATION");
        }

        // Release previous occupancy then re-apply.
        foreach (var rid in robot.OccupiedResourceIds.ToList())
        {
            ReleaseResource(robot, rid);
        }

        robot.Authority = null;
        robot.X = poseX;
        robot.Y = poseY;
        robot.LocalizationOk = true;
        robot.NodeId = RoutePlanner.NearestNode(_graph, poseX, poseY);

        var resources = occupiedEdges.Length > 0
            ? _graph.ResourcesCovering(occupiedEdges)
            : [];

        if (resources.Length > 0 && !TryOccupy(robot, resources, out var reason))
        {
            Quarantine(robot, reason ?? "RECONCILE_CONFLICT");
            return TrafficOpResult.Fail(reason ?? "CONFLICT");
        }

        robot.Phase = TrafficRobotPhase.Idle;
        robot.QuarantineReason = null;
        StateVersion++;
        Log($"reconcile-robot:{robotId}");
        return TrafficOpResult.Success();
    }

    public TrafficOpResult RenewAuthority(Guid robotId, Guid authorityId, long seq, long epoch)
    {
        if (epoch != Epoch)
        {
            return TrafficOpResult.Fail("STALE_EPOCH");
        }

        var robot = GetOrCreate(robotId);
        if (robot.Authority is null || robot.Authority.AuthorityId != authorityId)
        {
            return TrafficOpResult.Fail("AUTHORITY_MISMATCH");
        }

        if (seq < robot.LastSeq)
        {
            return TrafficOpResult.Fail("STALE_SEQ");
        }

        robot.LastSeq = seq;
        StateVersion++;
        return TrafficOpResult.Success();
    }

    public IReadOnlyDictionary<string, int> CongestionSnapshot()
    {
        return _holders.ToDictionary(kv => kv.Key, kv => kv.Value.Count, StringComparer.Ordinal);
    }

    public TrafficSnapshot Snapshot()
    {
        var robots = _robots.Values
            .OrderBy(r => r.RobotId)
            .Select(r => new RobotTrafficView(
                r.RobotId,
                r.Phase,
                r.NodeId,
                r.X,
                r.Y,
                r.LocalizationOk,
                r.OccupiedResourceIds.Order(StringComparer.Ordinal).ToImmutableArray(),
                r.Authority,
                r.LastSeq,
                r.WaitingReason,
                r.BlockingOwner,
                r.QuarantineReason,
                r.JobStepId))
            .ToImmutableArray();

        var resources = (_graph?.Resources ?? [])
            .Select(res =>
            {
                _holders.TryGetValue(res.Id, out var holders);
                _queues.TryGetValue(res.Id, out var waiters);
                return new ResourceTrafficView(
                    res.Id,
                    res.Kind,
                    res.Capacity,
                    (holders ?? []).OrderBy(id => id).ToImmutableArray(),
                    (waiters ?? []).Select(w => w.RobotId).ToImmutableArray(),
                    waiters?.Count ?? 0);
            })
            .ToImmutableArray();

        var waits = _queues
            .SelectMany(kv => kv.Value.Select(w => new TrafficWaitDiagnostics(
                w.RobotId,
                kv.Key,
                w.Reason,
                w.BlockingOwner,
                EffectivePriority(w),
                w.EnqueueSeq)))
            .OrderBy(w => w.EnqueueSeq)
            .ToImmutableArray();

        var cycles = DetectCycles()
            .Select(c => new TrafficCycleDiagnostics(c.ToImmutableArray()))
            .ToImmutableArray();

        return new TrafficSnapshot(
            Epoch,
            StateVersion,
            Phase,
            robots,
            resources,
            waits,
            cycles,
            _events.ToImmutableArray());
    }

    private void PromoteWaiters(IEnumerable<string> freedResources)
    {
        var candidates = new HashSet<Guid>();
        foreach (var rid in freedResources)
        {
            if (_queues.TryGetValue(rid, out var q))
            {
                foreach (var w in q)
                {
                    candidates.Add(w.RobotId);
                }
            }
        }

        // Deterministic order by effective priority across touched queues.
        var ordered = candidates
            .Select(id => FindWaiter(id))
            .Where(w => w is not null)
            .Select(w => w!)
            .OrderByDescending(EffectivePriority)
            .ThenBy(w => w.EnqueueSeq)
            .ToList();

        foreach (var waiter in ordered)
        {
            var robot = GetOrCreate(waiter.RobotId);
            if (robot.Phase == TrafficRobotPhase.Quarantined || robot.Authority is not null)
            {
                continue;
            }

            var result = AcquireAtomic(waiter.Candidate with { RequestId = Guid.NewGuid() }, Epoch, null);
            if (result.Granted)
            {
                RemoveFromAllQueues(waiter.RobotId);
            }
        }
    }

    private Waiter? FindWaiter(Guid robotId)
    {
        foreach (var q in _queues.Values)
        {
            var w = q.FirstOrDefault(x => x.RobotId == robotId);
            if (w is not null)
            {
                return w;
            }
        }

        return null;
    }

    private double EffectivePriority(Waiter w)
    {
        var waitedSec = (_clock.GetUtcNow() - w.EnqueuedAt).TotalSeconds;
        return w.Candidate.Priority + waitedSec * _options.AgingRate;
    }

    private void Enqueue(RobotRuntime robot, RouteSegmentCandidate candidate, TrafficWaitingReason reason, Guid? blocker)
    {
        robot.Phase = TrafficRobotPhase.Waiting;
        robot.WaitingReason = reason;
        robot.BlockingOwner = blocker;
        var waiter = new Waiter(robot.RobotId, candidate, reason, blocker, ++_enqueueSeq, _clock.GetUtcNow());

        foreach (var rid in candidate.ResourceIds)
        {
            if (!_queues.TryGetValue(rid, out var q))
            {
                q = [];
                _queues[rid] = q;
            }

            q.RemoveAll(w => w.RobotId == robot.RobotId);
            if (q.Count >= _options.MaxQueueLengthPerResource)
            {
                Log($"queue-full:{rid}");
                continue;
            }

            q.Add(waiter);
            // Keep sorted by enqueue for stability; promotion uses effective priority.
            q.Sort((a, b) => a.EnqueueSeq.CompareTo(b.EnqueueSeq));
        }

        StateVersion++;
        Log($"wait:{robot.RobotId}:{reason}");
    }

    private bool CanAcquire(
        ImmutableArray<string> resourceIds,
        Guid robotId,
        out Guid? blocker,
        out TrafficWaitingReason reason)
    {
        blocker = null;
        reason = TrafficWaitingReason.Capacity;
        if (_graph is null)
        {
            return false;
        }

        foreach (var rid in resourceIds)
        {
            if (!_graph.ResourceById.TryGetValue(rid, out var res))
            {
                continue;
            }

            _holders.TryGetValue(rid, out var holders);
            holders ??= [];
            var others = holders.Where(h => h != robotId).ToList();
            if (others.Count >= res.Capacity)
            {
                blocker = others.OrderBy(id => id).FirstOrDefault();
                reason = TrafficWaitingReason.Capacity;
                return false;
            }
        }

        return true;
    }

    private bool ReserveExits(ImmutableArray<int> exits, Guid robotId, out Guid? blocker)
    {
        blocker = null;
        // Soft check: another robot Idle/Holding at that safe-stop node blocks exit reservation.
        foreach (var nodeId in exits)
        {
            foreach (var other in _robots.Values.Where(r => r.RobotId != robotId && r.NodeId == nodeId))
            {
                if (other.Phase is TrafficRobotPhase.Idle or TrafficRobotPhase.HoldingService
                    or TrafficRobotPhase.Quarantined or TrafficRobotPhase.Waiting)
                {
                    // Occupying the exit bay.
                    if (other.OccupiedResourceIds.Count > 0 || other.Phase == TrafficRobotPhase.Quarantined)
                    {
                        blocker = other.RobotId;
                        return false;
                    }
                }
            }
        }

        return true;
    }

    private bool TryOccupy(RobotRuntime robot, IEnumerable<string> resourceIds, out string? reason)
    {
        reason = null;
        var list = resourceIds.Distinct(StringComparer.Ordinal).ToImmutableArray();
        if (!CanAcquire(list, robot.RobotId, out var blocker, out _))
        {
            reason = blocker is Guid b ? $"HELD_BY:{b}" : "CAPACITY";
            return false;
        }

        Occupy(robot, list);
        return true;
    }

    private void Occupy(RobotRuntime robot, ImmutableArray<string> resourceIds)
    {
        foreach (var rid in resourceIds)
        {
            if (!_holders.TryGetValue(rid, out var set))
            {
                set = [];
                _holders[rid] = set;
            }

            set.Add(robot.RobotId);
            robot.OccupiedResourceIds.Add(rid);
        }
    }

    private void ReleaseResource(RobotRuntime robot, string resourceId)
    {
        robot.OccupiedResourceIds.Remove(resourceId);
        if (_holders.TryGetValue(resourceId, out var set))
        {
            set.Remove(robot.RobotId);
            if (set.Count == 0)
            {
                _holders.Remove(resourceId);
            }
        }
    }

    private bool IsPhysicallyClear(RobotRuntime robot, string resourceId, double x, double y)
    {
        _ = robot;
        if (_graph is null || !_graph.ResourceById.TryGetValue(resourceId, out var res))
        {
            return false;
        }

        // Clear when pose is farther than turn radius from every edge of the resource.
        var radius = _graph.Footprint.TurnRadius;
        foreach (var edgeId in res.EdgeIds)
        {
            var edge = _graph.EdgeById[edgeId];
            var a = _graph.NodeById[edge.StartId];
            var b = _graph.NodeById[edge.EndId];
            var d = PointToSegmentDistance(x, y, a.X, a.Y, b.X, b.Y);
            if (d <= radius + 1e-6)
            {
                return false;
            }
        }

        return true;
    }

    private static double PointToSegmentDistance(
        double px, double py, double ax, double ay, double bx, double by)
    {
        var vx = bx - ax;
        var vy = by - ay;
        var wx = px - ax;
        var wy = py - ay;
        var c1 = vx * wx + vy * wy;
        if (c1 <= 0)
        {
            return Math.Sqrt(wx * wx + wy * wy);
        }

        var c2 = vx * vx + vy * vy;
        if (c2 <= c1)
        {
            var dx = px - bx;
            var dy = py - by;
            return Math.Sqrt(dx * dx + dy * dy);
        }

        var t = c1 / c2;
        var projX = ax + t * vx;
        var projY = ay + t * vy;
        var ex = px - projX;
        var ey = py - projY;
        return Math.Sqrt(ex * ex + ey * ey);
    }

    private bool WouldCreateWaitForCycle(Guid robotId, ImmutableArray<string> wanted)
    {
        // Build wait-for: robot → blocking owner of each wanted resource.
        var edges = new Dictionary<Guid, HashSet<Guid>>();
        void AddEdge(Guid from, Guid to)
        {
            if (!edges.TryGetValue(from, out var set))
            {
                set = [];
                edges[from] = set;
            }

            set.Add(to);
        }

        foreach (var r in _robots.Values)
        {
            if (r.BlockingOwner is Guid b)
            {
                AddEdge(r.RobotId, b);
            }
        }

        foreach (var rid in wanted)
        {
            if (_holders.TryGetValue(rid, out var holders))
            {
                foreach (var h in holders.Where(h => h != robotId))
                {
                    AddEdge(robotId, h);
                }
            }
        }

        return HasCycleFrom(robotId, edges);
    }

    private List<List<Guid>> DetectCycles()
    {
        var edges = new Dictionary<Guid, HashSet<Guid>>();
        foreach (var r in _robots.Values)
        {
            if (r.BlockingOwner is Guid b)
            {
                if (!edges.TryGetValue(r.RobotId, out var set))
                {
                    set = [];
                    edges[r.RobotId] = set;
                }

                set.Add(b);
            }
        }

        var cycles = new List<List<Guid>>();
        var visiting = new HashSet<Guid>();
        var visited = new HashSet<Guid>();
        var stack = new List<Guid>();

        foreach (var start in edges.Keys.OrderBy(id => id))
        {
            Dfs(start);
        }

        void Dfs(Guid node)
        {
            if (visited.Contains(node))
            {
                return;
            }

            if (!visiting.Add(node))
            {
                var idx = stack.IndexOf(node);
                if (idx >= 0)
                {
                    cycles.Add(stack.Skip(idx).Append(node).ToList());
                }

                return;
            }

            stack.Add(node);
            if (edges.TryGetValue(node, out var next))
            {
                foreach (var n in next.OrderBy(id => id))
                {
                    Dfs(n);
                }
            }

            stack.RemoveAt(stack.Count - 1);
            visiting.Remove(node);
            visited.Add(node);
        }

        return cycles;
    }

    private static bool HasCycleFrom(Guid start, Dictionary<Guid, HashSet<Guid>> edges)
    {
        var visiting = new HashSet<Guid>();
        var visited = new HashSet<Guid>();
        bool Dfs(Guid n)
        {
            if (visited.Contains(n))
            {
                return false;
            }

            if (!visiting.Add(n))
            {
                return true;
            }

            if (edges.TryGetValue(n, out var next))
            {
                foreach (var x in next)
                {
                    if (Dfs(x))
                    {
                        return true;
                    }
                }
            }

            visiting.Remove(n);
            visited.Add(n);
            return false;
        }

        return Dfs(start);
    }

    private void Quarantine(RobotRuntime robot, string reason)
    {
        robot.Phase = TrafficRobotPhase.Quarantined;
        robot.QuarantineReason = reason;
        robot.WaitingReason = TrafficWaitingReason.QuarantinedPeer;
        // Keep occupancy + authority held — no auto-release.
        RemoveFromAllQueues(robot.RobotId);
        StateVersion++;
        Log($"quarantine:{robot.RobotId}:{reason}");
    }

    private void RemoveFromAllQueues(Guid robotId)
    {
        foreach (var q in _queues.Values)
        {
            q.RemoveAll(w => w.RobotId == robotId);
        }
    }

    private Guid? FindAnyMover() =>
        _robots.Values
            .Where(r => r.Phase is TrafficRobotPhase.Authorized or TrafficRobotPhase.Moving)
            .Select(r => (Guid?)r.RobotId)
            .OrderBy(id => id)
            .FirstOrDefault();

    private RobotRuntime GetOrCreate(Guid robotId)
    {
        if (!_robots.TryGetValue(robotId, out var robot))
        {
            robot = new RobotRuntime(robotId);
            _robots[robotId] = robot;
        }

        return robot;
    }

    private AcquireResult Cache(Guid requestId, AcquireResult result)
    {
        _idempotency[requestId] = result;
        // Bound idempotency map.
        if (_idempotency.Count > _eventCap)
        {
            foreach (var key in _idempotency.Keys.Take(_idempotency.Count - _eventCap / 2).ToList())
            {
                _idempotency.Remove(key);
            }
        }

        return result;
    }

    private void Log(string message)
    {
        if (_events.Count >= _eventCap)
        {
            _events.Dequeue();
        }

        _events.Enqueue($"{_clock.GetUtcNow():O}|{message}");
    }

    private sealed class RobotRuntime(Guid robotId)
    {
        public Guid RobotId { get; } = robotId;
        public TrafficRobotPhase Phase { get; set; } = TrafficRobotPhase.Idle;
        public int? NodeId { get; set; }
        public double? X { get; set; }
        public double? Y { get; set; }
        public bool LocalizationOk { get; set; } = true;
        public HashSet<string> OccupiedResourceIds { get; } = new(StringComparer.Ordinal);
        public MotionAuthority? Authority { get; set; }
        public long LastSeq { get; set; }
        public TrafficWaitingReason WaitingReason { get; set; }
        public Guid? BlockingOwner { get; set; }
        public string? QuarantineReason { get; set; }
        public Guid? JobStepId { get; set; }
    }

    private sealed record Waiter(
        Guid RobotId,
        RouteSegmentCandidate Candidate,
        TrafficWaitingReason Reason,
        Guid? BlockingOwner,
        long EnqueueSeq,
        DateTimeOffset EnqueuedAt);
}
