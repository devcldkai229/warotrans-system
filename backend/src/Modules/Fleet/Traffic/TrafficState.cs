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

            if (!seed.PoseKnown || !seed.LocalizationOk)
            {
                Quarantine(robot, "RECONCILE_UNCERTAIN");
                continue;
            }

            // Localized with no granted edges (idle / rejected empty grant): ready, not quarantined.
            if (seed.OccupiedEdgeIds.Length == 0)
            {
                robot.Phase = TrafficRobotPhase.Idle;
                robot.QuarantineReason = null;
                robot.NodeId = RoutePlanner.NearestNode(_graph, seed.PoseX ?? 0, seed.PoseY ?? 0);
                Log($"reconcile:idle:{robot.RobotId}");
                continue;
            }

            var resources = _graph.ResourcesCovering(seed.OccupiedEdgeIds);
            if (!TryOccupy(robot, resources, out var reason))
            {
                Quarantine(robot, reason ?? "RECONCILE_CONFLICT");
                continue;
            }

            robot.Phase = TrafficRobotPhase.Idle;
            robot.QuarantineReason = null;
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
        robot.ProgressFloorSeq = robot.LastSeq;
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
        EmitSegmentEvent(TrafficEventKind.AuthorityGranted, robot, authority, candidate, isFirstSegment: true);
        return Cache(candidate.RequestId, AcquireResult.Grant(authority));
    }

    /// <summary>
    /// Active route: remembers the remaining segments + destination pose, then acquires the first segment.
    /// Later segments are granted by <see cref="AdvanceRoute"/> when the robot stops awaiting authority.
    /// </summary>
    public AcquireResult AcquireRoute(
        ImmutableArray<RouteSegmentCandidate> segments,
        TrafficRouteGoal goal,
        long? clientEpoch)
    {
        if (segments.IsDefaultOrEmpty)
        {
            return AcquireResult.Reject("EMPTY_ROUTE");
        }

        var robot = GetOrCreate(segments[0].RobotId);
        if (robot.Authority is not null)
        {
            return AcquireAtomic(segments[0], clientEpoch, null); // AUTHORITY_ALREADY_HELD, keep current route
        }

        robot.PendingSegments = segments.RemoveAt(0);
        robot.RouteGoal = goal;
        robot.AwaitingExtension = false;
        var result = AcquireAtomic(segments[0], clientEpoch, null);
        if (!result.Granted && !result.Queued)
        {
            ClearRoute(robot);
        }

        return result;
    }

    /// <summary>Grants the next pending segment as EXTEND (robot stopped at a safe stop awaiting authority).</summary>
    public TrafficOpResult AdvanceRoute(Guid robotId)
    {
        var robot = GetOrCreate(robotId);
        if (robot.Authority is null)
        {
            return TrafficOpResult.Fail("NO_AUTHORITY");
        }

        if (robot.PendingSegments.IsDefaultOrEmpty)
        {
            robot.AwaitingExtension = false;
            return TrafficOpResult.Fail("NO_PENDING_SEGMENT");
        }

        var next = robot.PendingSegments[0];
        var rest = robot.PendingSegments.RemoveAt(0);
        robot.PendingSegments = rest; // so the extend event knows whether it reaches the destination
        var result = ExtendAtomic(next with { RequestId = Guid.NewGuid() }, Epoch);
        if (!result.Granted)
        {
            robot.PendingSegments = rest.Insert(0, next);
            robot.AwaitingExtension = true; // retried by the renew tick
            return TrafficOpResult.Fail(result.Reason ?? result.WaitingReason.ToString());
        }

        robot.AwaitingExtension = false;
        return TrafficOpResult.Success();
    }

    /// <summary>Robots stopped at a safe stop whose next segment could not be granted yet.</summary>
    public IReadOnlyList<Guid> RobotsAwaitingExtension() =>
        _robots.Values
            .Where(r => r.AwaitingExtension && r.Authority is not null && r.Phase != TrafficRobotPhase.Quarantined)
            .Select(r => r.RobotId)
            .ToList();

    /// <summary>
    /// SAFE_STOP_REACHED: releases every occupied resource the robot has physically left (not station holds).
    /// Authority is kept: the robot either finishes the route or waits for EXTEND.
    /// </summary>
    public TrafficOpResult ReportSafeStopReached(Guid robotId, long seq, long epoch, double poseX, double poseY, bool localizationOk)
    {
        if (epoch != Epoch)
        {
            return TrafficOpResult.Fail("STALE_EPOCH");
        }

        var robot = GetOrCreate(robotId);
        if (!TryAcceptProgressSeq(robot, seq))
        {
            return TrafficOpResult.Fail("STALE_SEQ");
        }

        if (!localizationOk || _graph is null)
        {
            Quarantine(robot, "EXIT_UNCERTAIN");
            return TrafficOpResult.Fail("EXIT_UNCERTAIN");
        }

        robot.X = poseX;
        robot.Y = poseY;
        robot.LocalizationOk = true;
        robot.NodeId = RoutePlanner.NearestNode(_graph, poseX, poseY);

        var cleared = robot.OccupiedResourceIds
            .Where(rid => !robot.ServiceHoldIds.Contains(rid) && IsPhysicallyClear(robot, rid, poseX, poseY))
            .ToList();
        foreach (var rid in cleared)
        {
            ReleaseResource(robot, rid);
        }

        StateVersion++;
        Log($"safe-stop:{robotId}:released:{string.Join(",", cleared)}");
        PromoteWaiters(cleared);
        return TrafficOpResult.Success();
    }

    /// <summary>
    /// NAVIGATE finished. Success clears authority + route and releases what is physically clear; anything else
    /// quarantines (fail-closed, occupancy kept until verified exit / operator).
    /// </summary>
    public TrafficOpResult CompleteRoute(Guid robotId, bool succeeded, string? reason)
    {
        var robot = GetOrCreate(robotId);
        var previous = robot.Authority;
        ClearRoute(robot);
        if (!succeeded)
        {
            Quarantine(robot, $"NAVIGATE:{reason ?? "FAILED"}");
            return TrafficOpResult.Success();
        }

        var cleared = new List<string>();
        if (robot.X is double x && robot.Y is double y)
        {
            cleared = robot.OccupiedResourceIds
                .Where(rid => !robot.ServiceHoldIds.Contains(rid) && IsPhysicallyClear(robot, rid, x, y))
                .ToList();
            foreach (var rid in cleared)
            {
                ReleaseResource(robot, rid);
            }
        }

        robot.Authority = null;
        robot.Phase = robot.ServiceHoldIds.Count > 0 ? TrafficRobotPhase.HoldingService : TrafficRobotPhase.Idle;
        robot.WaitingReason = TrafficWaitingReason.None;
        StateVersion++;
        Log($"route-complete:{robotId}");
        if (previous is not null)
        {
            _pendingEvents.Add(new TrafficEvent(
                TrafficEventKind.AuthorityReleased, robot.RobotId, string.Empty, previous, null, null,
                robot.JobStepId, null, null, null, null, IsFirstSegment: false));
        }

        PromoteWaiters(cleared);
        return TrafficOpResult.Success();
    }

    private readonly List<TrafficEvent> _pendingEvents = [];

    /// <summary>Grant/extend/renew events produced by mutations since the last drain (consumed by actor outbox).</summary>
    public IReadOnlyList<TrafficEvent> DrainEvents()
    {
        if (_pendingEvents.Count == 0)
        {
            return [];
        }

        var events = _pendingEvents.ToList();
        _pendingEvents.Clear();
        return events;
    }

    private void EmitSegmentEvent(
        TrafficEventKind kind,
        RobotRuntime robot,
        MotionAuthority authority,
        RouteSegmentCandidate candidate,
        bool isFirstSegment)
    {
        var isFinal = robot.RouteGoal is not null && robot.PendingSegments.IsDefaultOrEmpty;
        double? goalX, goalY, goalYaw = null;
        if (isFinal)
        {
            (goalX, goalY, goalYaw) = (robot.RouteGoal!.X, robot.RouteGoal.Y, robot.RouteGoal.Yaw);
        }
        else
        {
            (goalX, goalY) = ResolveNodePose(candidate.GoalSafeStopNodeId);
        }

        _pendingEvents.Add(new TrafficEvent(
            kind,
            robot.RobotId,
            string.Empty,
            authority,
            null,
            candidate.JobId,
            candidate.JobStepId,
            goalX,
            goalY,
            goalYaw,
            null,
            isFirstSegment,
            isFinal));
    }

    /// <summary>
    /// Progress fencing. The floor is the last grant/extend seq plus the highest seq the robot itself reported —
    /// never LastSeq: RENEW bumps LastSeq before the robot has applied it, so a report sent just after a renew
    /// legitimately carries the previous seq.
    /// </summary>
    private static bool TryAcceptProgressSeq(RobotRuntime robot, long seq)
    {
        if (seq < Math.Max(robot.ProgressFloorSeq, robot.LastReportedSeq))
        {
            return false;
        }

        robot.LastReportedSeq = seq;
        robot.LastSeq = Math.Max(robot.LastSeq, seq);
        return true;
    }

    private static void ClearRoute(RobotRuntime robot)
    {
        robot.PendingSegments = [];
        robot.RouteGoal = null;
        robot.AwaitingExtension = false;
    }

    /// <summary>
    /// Extends an existing authority with the next safe-stop segment (lookahead). Cumulative edges.
    /// </summary>
    public AcquireResult ExtendAtomic(RouteSegmentCandidate candidate, long? clientEpoch)
    {
        if (_idempotency.TryGetValue(candidate.RequestId, out var cached))
        {
            return cached;
        }

        if (!_ready || Phase != "Ready" || _graph is null)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("RECONCILING", TrafficWaitingReason.Reconciling));
        }

        if (clientEpoch is long e && e != Epoch)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("STALE_EPOCH"));
        }

        var robot = GetOrCreate(candidate.RobotId);
        if (robot.Authority is null)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("NO_AUTHORITY"));
        }

        if (robot.Phase == TrafficRobotPhase.Quarantined)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("QUARANTINED"));
        }

        if (!CanAcquire(candidate.ResourceIds, robot.RobotId, out var blocker, out var waitReason))
        {
            return Cache(candidate.RequestId, AcquireResult.Queue(waitReason, blocker));
        }

        if (!ReserveExits(candidate.ExitSafeStops, robot.RobotId, out var exitBlocker))
        {
            return Cache(candidate.RequestId,
                AcquireResult.Queue(TrafficWaitingReason.ExitBlocked, exitBlocker, "EXIT_BLOCKED"));
        }

        Occupy(robot, candidate.ResourceIds);
        var prev = robot.Authority;
        var cumulativeEdges = prev.EdgeIds.Concat(candidate.EdgeIds).Distinct().ToImmutableArray();
        var cumulativeResources = prev.ResourceIds.Concat(candidate.ResourceIds)
            .Distinct(StringComparer.Ordinal).ToImmutableArray();
        robot.LastSeq++;
        robot.ProgressFloorSeq = robot.LastSeq;
        var authority = new MotionAuthority(
            prev.AuthorityId,
            robot.RobotId,
            prev.StartSafeStopNodeId,
            candidate.GoalSafeStopNodeId,
            cumulativeEdges,
            cumulativeResources,
            candidate.ExitSafeStops,
            robot.LastSeq,
            Epoch,
            candidate.GraphHash);
        robot.Authority = authority;
        robot.Phase = TrafficRobotPhase.Authorized;
        StateVersion++;
        Log($"extend:{robot.RobotId}:auth:{authority.AuthorityId}:seq:{authority.Seq}");
        EmitSegmentEvent(TrafficEventKind.AuthorityExtended, robot, authority, candidate, isFirstSegment: false);
        return Cache(candidate.RequestId, AcquireResult.Grant(authority));
    }

    public TrafficOpResult ReportProgress(Guid robotId, long seq, long epoch, int? nodeId, double? x, double? y, bool localizationOk)
    {
        if (epoch != Epoch)
        {
            return TrafficOpResult.Fail("STALE_EPOCH");
        }

        var robot = GetOrCreate(robotId);
        if (!TryAcceptProgressSeq(robot, seq))
        {
            return TrafficOpResult.Fail("STALE_SEQ"); // out-of-order ignored (idempotent reject)
        }

        robot.NodeId = nodeId ?? robot.NodeId;
        robot.X = x ?? robot.X;
        robot.Y = y ?? robot.Y;
        robot.LocalizationOk = localizationOk;
        if (!localizationOk)
        {
            Quarantine(robot, "LOCALIZATION_LOSS");
            return TrafficOpResult.Success();
        }

        // Brief TF blips can sticky-quarantine; clear LOCALIZATION_LOSS when pose recovers
        // while motion authority is still held so RENEW can resume.
        if (robot.Phase == TrafficRobotPhase.Quarantined
            && string.Equals(robot.QuarantineReason, "LOCALIZATION_LOSS", StringComparison.Ordinal)
            && robot.Authority is not null)
        {
            robot.QuarantineReason = null;
            robot.WaitingReason = TrafficWaitingReason.None;
            robot.Phase = TrafficRobotPhase.Moving;
            StateVersion++;
            Log($"recover-loc:{robot.RobotId}");
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
        if (!TryAcceptProgressSeq(robot, seq))
        {
            return TrafficOpResult.Fail("STALE_SEQ");
        }

        if (!localizationOk || _graph is null)
        {
            Quarantine(robot, "EXIT_UNCERTAIN");
            return TrafficOpResult.Fail("EXIT_UNCERTAIN");
        }

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

        robot.ServiceHoldIds.Add(resourceId);
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
        ClearRoute(robot);
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

        ClearRoute(robot);
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
        ClearRoute(robot);
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

    /// <summary>
    /// Bumps seq and emits <see cref="TrafficEventKind.AuthorityRenewed"/> so the publisher
    /// can keep the robot SafetySupervisor authority watchdog fed (Active Mode).
    /// </summary>
    public TrafficOpResult RenewAuthority(Guid robotId, Guid authorityId, long epoch, TimeSpan ttl)
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

        if (robot.Phase is not (TrafficRobotPhase.Authorized or TrafficRobotPhase.Moving))
        {
            return TrafficOpResult.Fail("NOT_AUTHORIZED");
        }

        robot.LastSeq += 1;
        var renewed = robot.Authority with { Seq = robot.LastSeq };
        robot.Authority = renewed;
        StateVersion++;
        var expiresAt = _clock.GetUtcNow().Add(ttl);
        _pendingEvents.Add(new TrafficEvent(
            TrafficEventKind.AuthorityRenewed,
            robot.RobotId,
            string.Empty,
            renewed,
            null,
            null,
            robot.JobStepId,
            null,
            null,
            null,
            expiresAt,
            IsFirstSegment: false));
        Log($"renew:{robot.RobotId}:auth:{renewed.AuthorityId}:seq:{renewed.Seq}");
        return TrafficOpResult.Success();
    }

    /// <summary>Robot ids that currently hold a motion authority (for renew tick).</summary>
    public IReadOnlyList<(Guid RobotId, Guid AuthorityId)> ActiveAuthorityKeys()
    {
        // Renew only while motion is authorized/moving — not during station holds
        // (hold may keep a prior Authority object; renewing there races NAVIGATE seq).
        return _robots.Values
            .Where(r => r.Authority is not null
                && r.Phase is TrafficRobotPhase.Authorized or TrafficRobotPhase.Moving)
            .Select(r => (r.RobotId, r.Authority!.AuthorityId))
            .ToList();
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
        robot.ServiceHoldIds.Remove(resourceId);
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

    private (double? X, double? Y) ResolveNodePose(int nodeId)
    {
        if (_graph is not null && _graph.NodeById.TryGetValue(nodeId, out var node))
        {
            return (node.X, node.Y);
        }

        return (null, null);
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
        /// <summary>Seq of the last grant/extend; progress below it is stale (renew does not move it).</summary>
        public long ProgressFloorSeq { get; set; }
        public long LastReportedSeq { get; set; }
        /// <summary>Station holds (bays) — never released by safe-stop / route completion.</summary>
        public HashSet<string> ServiceHoldIds { get; } = new(StringComparer.Ordinal);
        public ImmutableArray<RouteSegmentCandidate> PendingSegments { get; set; } = [];
        public TrafficRouteGoal? RouteGoal { get; set; }
        public bool AwaitingExtension { get; set; }
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
