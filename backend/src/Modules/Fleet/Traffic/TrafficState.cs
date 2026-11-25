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
    private readonly Queue<TrafficDecision> _decisions;
    private long _decisionSeq;
    private readonly int _eventCap;
    private CompiledTrafficGraph? _graph;
    private SemanticTrafficPolicy? _semantic;
    private readonly Dictionary<string, int> _semanticCapacities = new(StringComparer.Ordinal);
    private Guid _mapVersionId;
    private long _enqueueSeq;
    private bool _ready;
    private bool _reconciled;
    // Semantic start-up seeds that arrived before the zone/cell policy was bound (applied by BindSemanticPolicy).
    private IReadOnlyList<TrafficReconcileSeed>? _pendingSemanticSeeds;
    // One coordinator per resource domain: closed until the host holds the coordinator lease and has told every
    // robot the new epoch (TrafficCoordinatorLeaseHostedService). Open from the start when no lease is required.
    private bool _open;

    public TrafficState(TrafficOptions options, TimeProvider? clock = null)
    {
        _options = options;
        _clock = clock ?? TimeProvider.System;
        _eventCap = Math.Max(16, options.EventLogCapacity);
        _events = new Queue<string>(_eventCap);
        _decisions = new Queue<TrafficDecision>(_eventCap);
        _open = !options.RequireCoordinatorLease;
        Epoch = 1;
        Phase = "Reconciling";
    }

    /// <summary>Grants are refused (NOT_LEADER) until the lease is held and the epoch announced.</summary>
    public bool IsOpenForGrants => _open;

    public void SetOpenForGrants(bool open, string reason)
    {
        if (_open == open)
        {
            return;
        }

        _open = open;
        StateVersion++;
        Log($"coordinator-{(open ? "open" : "closed")}:{reason}");
    }

    public long Epoch { get; private set; }
    public long StateVersion { get; private set; }
    public string Phase { get; private set; }
    public CompiledTrafficGraph? Graph => _graph;
    public SemanticTrafficPolicy? SemanticPolicy => _semantic;

    public void BeginEpoch(long? forcedEpoch = null)
    {
        Epoch = forcedEpoch ?? Epoch + 1;
        Phase = "Reconciling";
        _ready = false;
        _reconciled = false;
        _pendingSemanticSeeds = null;
        _robots.Clear();
        _holders.Clear();
        _queues.Clear();
        _idempotency.Clear();
        _semanticCapacities.Clear();
        StateVersion++;
        Log($"epoch:{Epoch}:reconciling");
    }

    /// <summary>Stage-3: bind zone/cell policy keyed by semanticMapFingerprint (no RouteGraph).</summary>
    public TrafficOpResult BindSemanticPolicy(SemanticTrafficPolicy policy)
    {
        if (_semantic is not null
            && !string.Equals(_semantic.SemanticMapFingerprint, policy.SemanticMapFingerprint, StringComparison.Ordinal)
            && _robots.Values.Any(r => r.OccupiedResourceIds.Count > 0 || r.Authority is not null))
        {
            return TrafficOpResult.Fail(
                $"SEMANTIC_IN_USE bound={_semantic.SemanticMapFingerprint} requested={policy.SemanticMapFingerprint}");
        }

        _semantic = policy;
        _mapVersionId = policy.MapVersionId;
        _semanticCapacities.Clear();
        foreach (var z in policy.SingleOccupancyZones)
        {
            _semanticCapacities[$"zone:{z.Code}"] = 1;
        }

        // No compiled graph needed, but never Ready before start-up reconciliation: until then the coordinator does
        // not know what the robots stand on, and a grant could overlap a robot it has not seeded yet.
        if (_graph is null && _reconciled && !_ready)
        {
            ApplySemanticSeeds(_pendingSemanticSeeds ?? []);
            _pendingSemanticSeeds = null;
            Phase = "Ready";
            _ready = true;
        }

        StateVersion++;
        Log($"bind-semantic:{policy.SemanticMapFingerprint}:zones={policy.SingleOccupancyZones.Length}");
        return TrafficOpResult.Success();
    }

    /// <summary>
    /// Stage-3: robot proposes Nav2 path; coordinator reserves SINGLE_OCCUPANCY + swept cells (horizon-limited).
    /// </summary>
    /// <summary>A shorter grant is not worth it: the robot would stop again before it got anywhere.</summary>
    private const double MinPrefixMeters = 0.25;

    public AcquireResult AcquireSemanticPlan(SemanticPlanProposeRequest request)
    {
        if (_semantic is null)
        {
            return AcquireResult.Reject("SEMANTIC_POLICY_UNBOUND");
        }

        if (!string.Equals(request.SemanticMapFingerprint, _semantic.SemanticMapFingerprint, StringComparison.Ordinal))
        {
            // Evidence: which bundle the robot runs and which one the Host bound (a robot on another map never moves).
            Log($"semantic-reject-fingerprint:{request.RobotId}:robot={request.SemanticMapFingerprint} host={_semantic.SemanticMapFingerprint}");
            return AcquireResult.Reject("FINGERPRINT_MISMATCH");
        }

        if (!_open)
        {
            return AcquireResult.Reject("NOT_LEADER");
        }

        if (!_ready)
        {
            return AcquireResult.Reject("NOT_READY");
        }

        if (request.PlanRevision <= 0 || request.Poses.IsDefaultOrEmpty)
        {
            return AcquireResult.Reject("INVALID_PLAN");
        }

        if (request.CommandId is null && !_options.AllowStandaloneSemanticPlans)
        {
            // Only motion the backend commanded is authorized (no grant for an RViz / CLI goal).
            return AcquireResult.Reject("NO_ACTIVE_COMMAND");
        }

        var robot = GetOrCreate(request.RobotId);
        // Zone chain: the plan holds the zone the robot stands in anyway, so no stale heartbeat pose is put in front of
        // it (that re-requested cells behind a moving robot and got its grant revoked).
        var zoneChain = _semantic.UsesZoneChain;
        if (!zoneChain)
        {
            request = AnchoredAtSeenPose(robot, request);
        }

        // OFFLINE / LOCALIZATION_LOSS must NOT clear from traffic_plan alone — only verified
        // progress / health evidence may recover those faults (Stage-3 safety).
        if (robot.Phase == TrafficRobotPhase.Quarantined)
        {
            Log($"semantic-reject-quarantined:{robot.RobotId}:{robot.QuarantineReason}");
            return AcquireResult.Reject(
                $"QUARANTINED:{robot.QuarantineReason ?? "?"}",
                TrafficWaitingReason.QuarantinedPeer);
        }

        // A plan revision older than the one already accepted is a delayed / reordered message.
        if (request.CommandId == robot.ActiveCommandId && request.PlanRevision < robot.PlanRevision)
        {
            return AcquireResult.Reject("STALE_PLAN_REVISION");
        }

        if (robot.Authority is not null
            && robot.Authority.PlanRevision == request.PlanRevision
            && robot.Authority.CommandId == request.CommandId
            && string.Equals(robot.Authority.PlanHash, request.PlanHash, StringComparison.Ordinal)
            && string.Equals(robot.Authority.SemanticMapFingerprint, request.SemanticMapFingerprint, StringComparison.Ordinal))
        {
            if (TryExtendPartialGrant(robot, request) is { } extended)
            {
                return extended;
            }

            // Same plan: nothing new to reserve, but the grant still has to be refreshed.
            // Returning it untouched emitted no event, so no EXTEND/RENEW reached the robot
            // and expiresAt never moved — a robot that stopped republishing new revisions
            // (one holding still at its goal) simply aged out of its own authority.
            RenewAuthority(
                robot.RobotId,
                robot.Authority.AuthorityId,
                Epoch,
                TimeSpan.FromSeconds(Math.Max(5, _options.AuthorityTtlSec)));
            // The robot only re-proposes an unchanged plan while it has no working grant. If the EXTEND was lost it
            // holds nothing, so it ignores the RENEW above: send the grant again, or it waits forever on a plan the
            // backend considers granted. A robot that does hold it drops this as a duplicate.
            EmitSegmentEvent(
                TrafficEventKind.AuthorityExtended,
                robot,
                robot.Authority,
                new RouteSegmentCandidate(
                    request.RequestId,
                    request.RobotId,
                    _mapVersionId,
                    _semantic.SemanticMapFingerprint,
                    0,
                    0,
                    [],
                    robot.Authority.ResourceIds,
                    [],
                    0,
                    StateVersion,
                    request.Priority,
                    request.JobStepId,
                    request.JobId),
                isFirstSegment: false);
            return AcquireResult.Grant(robot.Authority);
        }

        // Replan: the old grant reserved another path. It is withdrawn here; if the new path is granted the robot
        // gets the new EXTEND, otherwise an explicit revoke (below) so it never keeps driving on the old one.
        var previous = robot.Authority;
        // Zone chain keeps the current grant across a replan of the SAME command only. A new command: the robot dropped
        // its grant itself (NEW_COMMAND); restoring it left the backend sure the robot may drive while the robot had
        // no grant and stood still holding the yard (sim V022 2026-11-24, two robots going home).
        var keepPrevious = zoneChain && previous is not null && previous.CommandId == request.CommandId;
        if (previous is not null && !keepPrevious)
        {
            RevokeAuthorityKeepOccupancy(robot, "REPLAN");
        }

        // Nav2 plans from the robot's localized pose: the first pose is the freshest position evidence there is.
        robot.X = request.Poses[0].X;
        robot.Y = request.Poses[0].Y;

        if (SemanticReservation.PlanHitsKeepout(_semantic, request.Poses))
        {
            robot.ProposedPath = [];
            Log($"semantic-reject-keepout:{robot.RobotId}:rev={request.PlanRevision}");
            if (previous is not null)
            {
                RevokeAuthorityKeepOccupancy(robot, "KEEPOUT");
                _pendingEvents.Add(new TrafficEvent(
                    TrafficEventKind.AuthorityRevoked, robot.RobotId, string.Empty, previous, previous.CommandId, null,
                    robot.JobStepId, null, null, null, null, IsFirstSegment: false));
            }

            return AcquireResult.Reject("KEEPOUT_VIOLATION");
        }

        robot.JobStepId = request.JobStepId;
        robot.ActiveCommandId = request.CommandId;
        robot.ProposedPath = request.Poses;
        robot.PlanRevision = request.PlanRevision;
        robot.PlanHash = request.PlanHash;
        if (request.Goal is { } g)
        {
            robot.RouteGoal = new TrafficRouteGoal(g.X, g.Y, g.Yaw);
            robot.PendingSegments = [];
        }

        var resources = SemanticReservation.CollectResources(_semantic, request.Poses);

        // Diff-release occupancy left behind by prior horizons (prevents corridor-wide lock). A robot that held no
        // grant before this plan is standing still behind a closed gate: it keeps only what its body covers, not the
        // part of its new plan it has never entered. Holding that part let a waiting robot (docking into a bay next
        // to a corridor) and a robot in the corridor each hold a strip the other needs — a wait-for cycle no one
        // could break, though the two were 0.9 m apart with a wall between them.
        var standingStill = previous is null && robot.Phase is TrafficRobotPhase.Waiting or TrafficRobotPhase.Idle;
        var standing = standingStill
            ? ResourcesUnder(request.Poses[0].X, request.Poses[0].Y, StandingYaw(robot, request.Poses[0].X, request.Poses[0].Y))
            : resources;
        // Zone chain: a robot that is driving keeps what its current grant gave it until the new plan is granted.
        ReleaseSemanticOccupancyOutside(
            robot,
            keepPrevious ? standing.Union(previous!.ResourceIds, StringComparer.Ordinal).ToImmutableArray() : standing);

        EnsureSemanticCapacities(resources);

        if (keepPrevious)
        {
            // Decided afresh below; restored when the new plan cannot be granted.
            robot.Authority = null;
        }

        var result = TryGrantSemantic(robot, request, resources);
        if (keepPrevious)
        {
            if (result.Granted)
            {
                ReleaseSemanticOccupancyOutside(robot, resources);
                return result;
            }

            // Not granted (a zone or a body ahead is taken): it keeps driving on what it already holds, the robot gate
            // stops it where the new path leaves that, and it stays queued for the rest. Revoking here stopped a robot
            // on the spot in a corridor and made it the next robot's blocker.
            robot.Authority = previous;
            robot.PartialAuthorityId = previous!.AuthorityId;
            robot.Phase = TrafficRobotPhase.Authorized;
            Log($"zone-chain-keep:{robot.RobotId}:{previous.AuthorityId}:{result.Reason}");
            return result;
        }

        if (!result.Granted && previous is not null)
        {
            _pendingEvents.Add(new TrafficEvent(
                TrafficEventKind.AuthorityRevoked, robot.RobotId, string.Empty, previous, previous.CommandId, null,
                robot.JobStepId, null, null, null, null, IsFirstSegment: false));
            Log($"revoke-replan-wait:{robot.RobotId}:{previous.AuthorityId}:{result.Reason}");
        }

        return result;
    }

    private AcquireResult TryGrantSemantic(
        RobotRuntime robot, SemanticPlanProposeRequest request, ImmutableArray<string> resources)
    {
        if (robot.HoldGrantsUntil is { } held && _clock.GetUtcNow() < held)
        {
            // Gave way in a wait-for cycle: the other robot moves first.
            return AcquireResult.Reject("YIELDING", TrafficWaitingReason.Capacity);
        }

        var candidate = new RouteSegmentCandidate(
            request.RequestId,
            request.RobotId,
            _mapVersionId,
            _semantic!.SemanticMapFingerprint,
            0,
            0,
            [],
            resources,
            [],
            0,
            StateVersion,
            request.Priority,
            request.JobStepId,
            request.JobId);

        if (WouldCreateWaitForCycle(robot.RobotId, resources))
        {
            robot.WaitingReason = TrafficWaitingReason.DeadlockRisk;
            robot.Phase = TrafficRobotPhase.Waiting;
            StateVersion++;
            Log($"deadlock-reject-semantic:{robot.RobotId}");
            return AcquireResult.Reject("DEADLOCK_RISK", TrafficWaitingReason.DeadlockRisk);
        }

        Guid? blocker;
        TrafficWaitingReason waitReason;
        // No barging: a robot queued earlier (or with more aged priority) for any of these resources goes first.
        if (FindPriorWaiter(robot.RobotId, resources, request.Priority) is { } prior)
        {
            blocker = prior;
            waitReason = TrafficWaitingReason.Capacity;
        }
        else if (CanAcquire(resources, robot.RobotId, out blocker, out waitReason))
        {
            blocker = null;
        }
        else if (blocker is { } standing && !_semantic.UsesZoneChain && StandsStill(standing)
                 && SemanticReservation.CollectResources(_semantic, request.Poses, narrow: true) is var narrow
                 && FindPriorWaiter(robot.RobotId, narrow, request.Priority) is null
                 && !WouldCreateWaitForCycle(robot.RobotId, narrow)
                 && CanAcquire(narrow, robot.RobotId, out _, out _))
        {
            // Held only by a robot that stands still (waiting for a confirmation at an endpoint, parked): pass it in a
            // band without the drift room. Its body (and every other robot's) still stays outside the grant, and the
            // robot gate stops this one if it drifts out; Nav2 keeps its distance from the standing robot it sees.
            Log($"grant-narrow-past-standing:{robot.RobotId}:{standing}");
            resources = narrow;
            candidate = candidate with { ResourceIds = narrow };
            blocker = null;
        }
        else
        {
            blocker ??= Guid.Empty;
        }

        if (blocker is not null)
        {
            var b = blocker == Guid.Empty ? (Guid?)null : blocker;
            // Zone chain: all or nothing. The robot waits where it stands (a stop: it only stops at the end of a plan).
            var prefix = _options.SemanticPrefixGrant && !_semantic.UsesZoneChain ? GrantablePrefix(robot, request) : [];
            if (prefix.Length > 0)
            {
                var partial = IssueSemanticAuthority(robot, request, candidate, prefix);
                robot.PartialAuthorityId = partial.AuthorityId;
                // Stays queued for the whole plan; still authorized for the part it holds.
                Enqueue(robot, candidate, waitReason, b);
                robot.Phase = TrafficRobotPhase.Authorized;
                return AcquireResult.Grant(partial);
            }

            Enqueue(robot, candidate, waitReason, b);
            var detail = b is Guid bb ? $"{waitReason}:blocker={bb:N}" : waitReason.ToString();
            return AcquireResult.Queue(waitReason, b, detail);
        }

        var authority = IssueSemanticAuthority(robot, request, candidate, resources);
        robot.PartialAuthorityId = null;
        robot.WaitingReason = TrafficWaitingReason.None;
        robot.BlockingOwner = null;
        RemoveFromAllQueues(robot.RobotId);
        return AcquireResult.Grant(authority);
    }

    private MotionAuthority IssueSemanticAuthority(
        RobotRuntime robot,
        SemanticPlanProposeRequest request,
        RouteSegmentCandidate candidate,
        ImmutableArray<string> resources)
    {
        Occupy(robot, resources);
        robot.LastSeq = robot.LastSeq + 1;
        robot.ProgressFloorSeq = robot.LastSeq;
        var authority = new MotionAuthority(
            Guid.NewGuid(),
            robot.RobotId,
            0,
            0,
            [],
            resources,
            [],
            robot.LastSeq,
            Epoch,
            _semantic!.SemanticMapFingerprint,
            [],
            request.PlanRevision,
            _semantic.SemanticMapFingerprint,
            request.PlanHash,
            request.CommandId);
        robot.Authority = authority;
        robot.YawAt = null; // it may turn now: the standing heading is known again once it reports it
        robot.Phase = TrafficRobotPhase.Authorized;
        StateVersion++;
        Log($"grant-semantic:{robot.RobotId}:auth:{authority.AuthorityId}:rev:{request.PlanRevision}:n={resources.Length}");
        EmitSegmentEvent(TrafficEventKind.AuthorityGranted, robot, authority, candidate, isFirstSegment: true);
        return authority;
    }

    /// <summary>
    /// The longest start of the plan this robot can hold now and wait at the end of. Empty when that gains nothing.
    /// Never reaches into what another moving robot's whole path still needs: waiting there, face to face in a
    /// corridor or on a crossing, is how two robots lock each other. The current holder keeps priority over the waiter.
    /// </summary>
    private ImmutableArray<string> GrantablePrefix(RobotRuntime robot, SemanticPlanProposeRequest request)
    {
        var policy = _semantic!;
        if (policy.UsesZoneChain)
        {
            return [];
        }

        var samples = SemanticReservation.SweptSamples(
            policy, request.Poses, Math.Max(policy.EffectiveCellSize, policy.HorizonMeters));
        if (samples.Count == 0)
        {
            return [];
        }

        // What the other moving robots still need: their plans from where they are now (the part they drove is not
        // needed any more; lab 2026-11-25: a robot waited for cells the other had long left), with the directions they
        // drive through each resource.
        var needed = new Dictionary<string, List<(double Ux, double Uy)>>(StringComparer.Ordinal);
        foreach (var other in _robots.Values)
        {
            if (other.RobotId == robot.RobotId || other.ActiveCommandId is null || other.ProposedPath.IsDefaultOrEmpty)
            {
                continue;
            }

            var ahead = other.X is double ox && other.Y is double oy
                ? TrimProposedPathFromPose(other.ProposedPath, ox, oy).Path
                : other.ProposedPath;
            foreach (var (rid, dirs) in SemanticReservation.WholePathHeadings(policy, ahead))
            {
                if (!needed.TryGetValue(rid, out var list))
                {
                    needed[rid] = list = [];
                }

                list.AddRange(dirs);
            }
        }

        // Where the other robots stand now: the grant must not end with this robot's body right against one of them
        // (sim V024 S5: a follower stopped 0.15 m behind a robot parked on its way; the cells did not overlap).
        var others = _robots.Values
            .Where(o => o.RobotId != robot.RobotId && o.X is not null && o.Y is not null)
            .Select(o => (X: o.X!.Value, Y: o.Y!.Value))
            .ToList();

        var zonesAtStart = samples[0].Resources
            .Where(rid => rid.StartsWith("zone:", StringComparison.Ordinal))
            .ToHashSet(StringComparer.Ordinal);
        var held = new HashSet<string>(StringComparer.Ordinal);
        ImmutableArray<string> best = [];
        var minSamples = (int)Math.Ceiling(MinPrefixMeters / policy.SampleStepMeters);
        for (var i = 0; i < samples.Count; i++)
        {
            var here = samples[i].Resources;
            var ids = here.OrderBy(x => x, StringComparer.Ordinal).ToImmutableArray();
            if (MeetsAnotherRobot(here, SemanticReservation.SampleDirection(samples, i), needed)
                || FindPriorWaiter(robot.RobotId, ids, request.Priority) is not null
                || !CanAcquire(ids, robot.RobotId, out _, out _))
            {
                break;
            }

            held.UnionWith(here);
            if (i >= minSamples && SemanticReservation.MayWaitAt(policy, samples[i].X, samples[i].Y, zonesAtStart)
                && others.All(o => Math.Sqrt(Math.Pow(samples[i].X - o.X, 2) + Math.Pow(samples[i].Y - o.Y, 2)) >= WaitClearanceMeters))
            {
                best = held.OrderBy(x => x, StringComparer.Ordinal).ToImmutableArray();
            }
        }

        return best;
    }

    /// <summary>
    /// Following another robot (both drive the same way through every shared cell: cos &gt; <see
    /// cref="FollowMinCos"/>) is fine: the follower ends up behind it, and the cells the leader holds stay out of the
    /// grant anyway (CanAcquire). Head-on, crossing, a zone, or a cell where the direction is unknown is a meeting.
    /// </summary>
    private static bool MeetsAnotherRobot(
        HashSet<string> here, (double Ux, double Uy)? mine, Dictionary<string, List<(double Ux, double Uy)>> needed)
    {
        foreach (var rid in here)
        {
            if (!needed.TryGetValue(rid, out var theirs))
            {
                continue;
            }

            if (mine is not { } m || theirs.Count == 0 || !rid.StartsWith("cell:", StringComparison.Ordinal)
                || theirs.Any(t => t.Ux * m.Ux + t.Uy * m.Uy <= FollowMinCos))
            {
                return true;
            }
        }

        return false;
    }

    private const double FollowMinCos = 0.7;

    /// <summary>Centre to centre: a step-by-step grant never ends closer to another robot (about 0.25 m body to body).</summary>
    private const double WaitClearanceMeters = 0.60;

    /// <summary>
    /// A robot holding part of its plan, re-evaluated (something was freed, or it asked again). The rest of the plan or
    /// a longer part of it replaces the grant; null when nothing more can be granted.
    /// </summary>
    private AcquireResult? TryExtendPartialGrant(RobotRuntime robot, SemanticPlanProposeRequest request)
    {
        if (robot.HoldGrantsUntil is { } held && _clock.GetUtcNow() < held)
        {
            return null;
        }

        if (robot.Authority is not { } current || robot.PartialAuthorityId != current.AuthorityId)
        {
            return null;
        }

        var candidate = new RouteSegmentCandidate(
            request.RequestId, request.RobotId, _mapVersionId, _semantic!.SemanticMapFingerprint, 0, 0, [],
            SemanticReservation.CollectResources(_semantic, request.Poses), [], 0, StateVersion, request.Priority,
            request.JobStepId, request.JobId);
        var whole = candidate.ResourceIds;
        if (FindPriorWaiter(robot.RobotId, whole, request.Priority) is null
            && CanAcquire(whole, robot.RobotId, out _, out _))
        {
            var full = IssueSemanticAuthority(robot, request, candidate, whole);
            robot.PartialAuthorityId = null;
            robot.WaitingReason = TrafficWaitingReason.None;
            robot.BlockingOwner = null;
            RemoveFromAllQueues(robot.RobotId);
            return AcquireResult.Grant(full);
        }

        var prefix = GrantablePrefix(robot, request);
        if (prefix.IsDefaultOrEmpty || prefix.All(current.ResourceIds.Contains))
        {
            return null;
        }

        // Union: what it was already given may lie behind it, and the gate must not close under its feet.
        var longer = IssueSemanticAuthority(
            robot, request, candidate,
            prefix.Union(current.ResourceIds, StringComparer.Ordinal).OrderBy(x => x, StringComparer.Ordinal).ToImmutableArray());
        robot.PartialAuthorityId = longer.AuthorityId;
        return AcquireResult.Grant(longer);
    }

    /// <summary>
    /// A waiter of another robot that is ahead of this request on one of <paramref name="resources"/> (higher effective
    /// priority, or same priority and queued earlier). Waiters that are themselves waiting on this robot are skipped:
    /// deferring to them could never be resolved (they need what this robot holds).
    /// </summary>
    private Guid? FindPriorWaiter(Guid robotId, ImmutableArray<string> resources, int requestPriority)
    {
        var own = FindWaiter(robotId);
        var ownPriority = own is null ? requestPriority : EffectivePriority(own);
        var ownSeq = own?.EnqueueSeq ?? long.MaxValue;
        foreach (var rid in resources)
        {
            // Only single-occupancy zones keep their queue order. A waiter is queued on every cell of its whole horizon;
            // ordering on cells made a robot standing still at a wait point the "blocker" of cells nobody held, and those
            // made-up wait-for edges ended in DEADLOCK_RISK and needless retreats (MAP-ONE-V013, 2026-11-22).
            if (!rid.StartsWith("zone:", StringComparison.Ordinal) || !_queues.TryGetValue(rid, out var q))
            {
                continue;
            }

            foreach (var w in q)
            {
                if (w.RobotId == robotId)
                {
                    continue;
                }

                var p = EffectivePriority(w);
                var ahead = p > ownPriority || (Math.Abs(p - ownPriority) < 1e-9 && w.EnqueueSeq < ownSeq);
                if (ahead && !WaitsOn(w.RobotId, robotId))
                {
                    return w.RobotId;
                }
            }
        }

        return null;
    }

    /// <summary>Wait-for reachability: <paramref name="from"/> transitively waits on <paramref name="to"/>.</summary>
    private bool WaitsOn(Guid from, Guid to)
    {
        var seen = new HashSet<Guid>();
        var stack = new Stack<Guid>();
        stack.Push(from);
        while (stack.Count > 0)
        {
            var current = stack.Pop();
            if (!seen.Add(current) || !_robots.TryGetValue(current, out var r) || r.BlockingOwner is not Guid next)
            {
                continue;
            }

            if (next == to)
            {
                return true;
            }

            stack.Push(next);
        }

        return false;
    }

    private void EnsureSemanticCapacities(ImmutableArray<string> resourceIds)
    {
        foreach (var rid in resourceIds)
        {
            if (!_semanticCapacities.ContainsKey(rid))
            {
                _semanticCapacities[rid] = 1;
            }
        }
    }

    /// <summary>
    /// Release occupied cell:/zone: resources that are outside the new horizon and physically clear.
    /// Resources still under the footprint are retained (fail-closed).
    /// </summary>
    private void ReleaseSemanticOccupancyOutside(RobotRuntime robot, ImmutableArray<string> keepResources)
    {
        if (_semantic is null)
        {
            return;
        }

        var keep = keepResources.IsDefaultOrEmpty
            ? new HashSet<string>(StringComparer.Ordinal)
            : keepResources.ToHashSet(StringComparer.Ordinal);

        if (robot.X is not double rx || robot.Y is not double ry)
        {
            // Unknown pose → cannot prove clearance; retain occupancy.
            return;
        }

        var candidates = robot.OccupiedResourceIds
            .Where(rid => !keep.Contains(rid) && !robot.ServiceHoldIds.Contains(rid))
            .Where(rid => rid.StartsWith("cell:", StringComparison.Ordinal)
                || rid.StartsWith("zone:", StringComparison.Ordinal))
            .ToList();
        if (candidates.Count == 0)
        {
            return;
        }

        var released = new List<string>();
        foreach (var rid in candidates)
        {
            if (!IsPhysicallyClear(robot, rid, rx, ry))
            {
                continue;
            }

            ReleaseResource(robot, rid);
            released.Add(rid);
        }

        if (released.Count > 0)
        {
            StateVersion++;
            Log($"semantic-diff-release:{robot.RobotId}:n={released.Count}");
            PromoteWaiters(released);
        }
    }

    private void RevokeAuthorityKeepOccupancy(RobotRuntime robot, string reason)
    {
        if (robot.Authority is null)
        {
            return;
        }

        Log($"revoke-keep-occ:{robot.RobotId}:{reason}:{robot.Authority.AuthorityId}");
        robot.Authority = null;
        if (robot.Phase is TrafficRobotPhase.Authorized or TrafficRobotPhase.Moving)
        {
            robot.Phase = TrafficRobotPhase.Waiting;
        }
    }

    /// <summary>
    /// Binds the graph every resource id refers to. Swapping to a different graph while any robot holds occupancy
    /// or authority would re-interpret those ids against other geometry, so it is refused (GRAPH_IN_USE).
    /// </summary>
    public TrafficOpResult BindGraph(Guid mapVersionId, CompiledTrafficGraph graph)
    {
        if (_graph is not null
            && !string.Equals(_graph.GraphHash, graph.GraphHash, StringComparison.Ordinal)
            && _robots.Values.Any(r => r.OccupiedResourceIds.Count > 0 || r.Authority is not null))
        {
            Log($"bind-refused:{graph.GraphHash}:in-use:{_graph.GraphHash}");
            return TrafficOpResult.Fail(
                $"GRAPH_IN_USE bound={_graph.GraphHash} requested={graph.GraphHash} mapBound={_mapVersionId} mapReq={mapVersionId}");
        }

        _mapVersionId = mapVersionId;
        _graph = graph;
        StateVersion++;
        return TrafficOpResult.Success();
    }

    public void CompleteReconciliation(IReadOnlyList<TrafficReconcileSeed> seeds)
    {
        _reconciled = true;
        if (_graph is null)
        {
            if (_semantic is null)
            {
                // Semantic Mode binds its policy separately; until then the seeds cannot be turned into
                // zone/cell occupancy, so they wait and the coordinator stays not-ready.
                _pendingSemanticSeeds = seeds;
                Phase = "AwaitingPolicy";
                StateVersion++;
                Log($"reconcile:awaiting-policy:seeds={seeds.Count}");
                return;
            }

            ApplySemanticSeeds(seeds);
            Phase = "Ready";
            _ready = true;
            StateVersion++;
            Log("reconcile:complete-semantic");
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

            // The floor under the robot is occupied whatever it was doing (audit T8).
            var x = seed.PoseX!.Value;
            var y = seed.PoseY!.Value;
            robot.NodeId = RoutePlanner.NearestNode(_graph, x, y);
            var resources = ResourcesAtPose(x, y)
                .Concat(_graph.ResourcesCovering(seed.OccupiedEdgeIds))
                .Distinct(StringComparer.Ordinal)
                .ToList();
            if (!TryOccupy(robot, resources, out var reason))
            {
                Quarantine(robot, $"RECONCILE_CONFLICT:{reason}");
                continue;
            }

            if (seed.OccupiedEdgeIds.Length > 0)
            {
                // It was driving under an authority of the previous epoch, which no longer exists: it stops on its
                // authority watchdog. Hold everything it may still be on until it reports a verified state.
                Quarantine(robot, "RECONCILE_IN_MOTION");
                continue;
            }

            robot.Phase = TrafficRobotPhase.Idle;
            robot.QuarantineReason = null;
            Log($"reconcile:ok:{robot.RobotId}");
        }

        Phase = "Ready";
        _ready = true;
        StateVersion++;
        Log("reconcile:complete");
    }

    /// <summary>
    /// Semantic start-up (audit T8 for Stage-3): every robot occupies the zones/cells under it; one that may have been
    /// driving under the previous epoch, or whose pose is unknown, is quarantined until it reports a verified state.
    /// </summary>
    private void ApplySemanticSeeds(IReadOnlyList<TrafficReconcileSeed> seeds)
    {
        foreach (var seed in seeds.OrderBy(s => s.RobotId))
        {
            var robot = GetOrCreate(seed.RobotId);
            robot.JobStepId = seed.JobStepId;
            robot.LocalizationOk = seed.LocalizationOk;
            robot.X = seed.PoseX;
            robot.Y = seed.PoseY;
            if (!seed.PoseKnown || !seed.LocalizationOk || seed.PoseX is not double x || seed.PoseY is not double y)
            {
                Quarantine(robot, "RECONCILE_UNCERTAIN");
                continue;
            }

            if (!TryOccupy(robot, ResourcesUnder(x, y, StandingYaw(robot, x, y)), out var reason))
            {
                Quarantine(robot, $"RECONCILE_CONFLICT:{reason}");
                continue;
            }

            if (seed.InMotion)
            {
                Quarantine(robot, "RECONCILE_IN_MOTION");
                continue;
            }

            robot.Phase = TrafficRobotPhase.Idle;
            robot.QuarantineReason = null;
            Log($"reconcile-semantic:ok:{robot.RobotId}");
        }
    }

    /// <summary>
    /// The heading of a robot that stands still at (x, y): the one it reported there with no grant since (a grant lets it
    /// turn). Null when unknown, stale, or the robot may move: callers then use the any-heading circle.
    /// </summary>
    private static double? StandingYaw(RobotRuntime robot, double x, double y) =>
        robot.Authority is null && robot.YawAt is { } at && Math.Abs(at.X - x) <= 0.03 && Math.Abs(at.Y - y) <= 0.03
            ? at.Yaw
            : null;

    /// <summary>Largest gap between the plan's first pose and the reported pose that is bridged (more is a fault).</summary>
    public const double PlanStartBridgeMaxMeters = 0.30;

    /// <summary>
    /// The plan as reserved: starting where the robot last reported itself, when Nav2's path starts a little elsewhere.
    /// The robot gate checks the body at the reported pose; Nav2 plans from its own TF pose. Lab 2026-11-23: RBT-001 at
    /// EP-QUEUE-B reported (2.24, 0.47) while every plan started at (2.21, 0.38); with the path tolerance growing from
    /// the start, the two cells in front of its body were not granted and the gate held it (OUTSIDE_RESERVATION).
    /// </summary>
    private SemanticPlanProposeRequest AnchoredAtSeenPose(RobotRuntime robot, SemanticPlanProposeRequest request)
    {
        if (robot.SeenAt is not { } seen || _clock.GetUtcNow() - seen.At > TimeSpan.FromSeconds(5))
        {
            return request;
        }

        var first = request.Poses[0];
        var gap = Math.Sqrt(Math.Pow(first.X - seen.X, 2) + Math.Pow(first.Y - seen.Y, 2));
        if (gap < 0.01 || gap > PlanStartBridgeMaxMeters)
        {
            return request;
        }

        return request with { Poses = request.Poses.Insert(0, new SemanticPlanPose(seen.X, seen.Y, first.Yaw)) };
    }

    /// <summary>A robot that stands still: no grant, no command (idle, parked, or held at a service stop).</summary>
    private bool StandsStill(Guid robotId) =>
        _robots.TryGetValue(robotId, out var r) && r.Authority is null && r.ActiveCommandId is null
        && r.Phase is TrafficRobotPhase.Idle or TrafficRobotPhase.HoldingService;

    /// <summary>Records the heading a robot reports while it stands still (no grant).</summary>
    private static void NoteYaw(RobotRuntime robot, double? x, double? y, double? yaw, bool localizationOk)
    {
        if (robot.Authority is null && localizationOk && x is double px && y is double py && yaw is double h && double.IsFinite(h))
        {
            robot.YawAt = (px, py, h);
        }
    }

    /// <summary>What a robot standing at (x, y) occupies: graph resources, or Stage-3 zones/cells (heading when known).</summary>
    private ImmutableArray<string> ResourcesUnder(double x, double y, double? standingYaw = null)
    {
        if (_graph is not null)
        {
            return ResourcesAtPose(x, y);
        }

        if (_semantic is null)
        {
            return [];
        }

        // A robot that stands still only needs its body (any heading) plus the localization margin. The path tolerance
        // and sample spacing of CollectResources are for a robot that drives; adding them made a parked robot hold
        // ~0.45 m around itself, so two homes 0.85 m apart seeded into each other and a parked robot blocked the lane
        // next to it.
        // With its heading known (standing still since it reported it), the body rectangle at that heading.
        var set = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.StandingCells(_semantic, x, y, standingYaw, _options.EffectiveStandingMargin, set);
        // A robot standing still does not turn before its next grant (which takes the zone if the turn needs it), so the
        // zone test uses its half length, not the any-heading circle: on MAP-ONE-V013 (2026-11-22) RBT-002 parked at
        // EP-PARKING-B, 0.245 m below ZONE-SINGLE-CENTER, held the whole zone and RBT-001 waited for it forever.
        var zoneRadius = Math.Max(_semantic.FootprintHalfLength, _semantic.FootprintHalfWidth);
        foreach (var z in _semantic.SingleOccupancyZones.Where(z => SemanticReservation.DiscHitsZone(x, y, zoneRadius, z.Ring)))
        {
            set.Add($"zone:{z.Code}");
        }

        // Zone chain: a robot standing still holds the zone it stands in (its slot, its bay, or the corridor it was
        // stopped in, which nobody may then drive through).
        if (SemanticReservation.StandingZoneResource(_semantic, x, y) is { } standingZone)
        {
            set.Add(standingZone);
        }

        var under = set.OrderBy(r => r, StringComparer.Ordinal).ToImmutableArray();
        EnsureSemanticCapacities(under);
        return under;
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

        // One authority per robot; later segments of a route are added by ExtendAtomic (hold-and-wait, cycle-checked).
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
            // Wake up when the robot standing on the exit releases what it holds, not only our own resources
            // (audit T7: those are usually free, so the waiter was never promoted).
            var blockerHeld = exitBlocker is Guid b && _robots.TryGetValue(b, out var other)
                ? other.OccupiedResourceIds.ToImmutableArray()
                : [];
            Enqueue(robot, candidate, TrafficWaitingReason.ExitBlocked, exitBlocker, blockerHeld);
            return Cache(candidate.RequestId,
                AcquireResult.Queue(TrafficWaitingReason.ExitBlocked, exitBlocker, "EXIT_BLOCKED"));
        }

        Occupy(robot, candidate.ResourceIds);
        robot.LastSeq = Math.Max(robot.LastSeq + 1, clientSeq ?? robot.LastSeq + 1);
        robot.ProgressFloorSeq = robot.LastSeq;
        var maneuvers = candidate.Maneuvers.IsDefaultOrEmpty
            ? ManeuverStepBuilder.Build(_graph, candidate.EdgeIds)
            : candidate.Maneuvers;
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
            candidate.GraphHash,
            maneuvers);
        robot.Authority = authority;
        robot.YawAt = null; // it may turn now: the standing heading is known again once it reports it
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

    /// <summary>
    /// STOPPED_AWAITING_AUTHORITY (audit T9): only an accepted (non-stale) report from a robot standing at its
    /// authority's goal safe stop arms the next EXTEND. A duplicate or delayed report carries a seq below the floor
    /// set by that EXTEND and is rejected, so it can never grant a segment the robot did not ask for.
    /// </summary>
    public TrafficOpResult ReportStoppedAwaiting(
        Guid robotId, long seq, long epoch, double? poseX, double? poseY, bool localizationOk)
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
            Quarantine(robot, "LOCALIZATION_LOSS");
            return TrafficOpResult.Fail("LOCALIZATION_LOSS");
        }

        if (robot.Authority is not { } auth)
        {
            return TrafficOpResult.Fail("NO_AUTHORITY");
        }

        if (poseX is double x && poseY is double y)
        {
            robot.X = x;
            robot.Y = y;
            robot.NodeId = RoutePlanner.NearestNode(_graph, x, y);
            if (_graph.NodeById.TryGetValue(auth.GoalSafeStopNodeId, out var goal)
                && Math.Sqrt(Square(goal.X - x) + Square(goal.Y - y)) > ClearRadius)
            {
                return TrafficOpResult.Fail("NOT_AT_SAFE_STOP");
            }
        }

        robot.AwaitingExtension = true;
        return AdvanceRoute(robotId);
    }

    private static double Square(double v) => v * v;

    /// <summary>
    /// Grants the next pending segment as EXTEND. Only for a robot armed by <see cref="ReportStoppedAwaiting"/>
    /// (or still waiting from an earlier busy attempt, retried by the renew tick).
    /// </summary>
    public TrafficOpResult AdvanceRoute(Guid robotId)
    {
        var robot = GetOrCreate(robotId);
        if (robot.Authority is null)
        {
            return TrafficOpResult.Fail("NO_AUTHORITY");
        }

        if (!robot.AwaitingExtension)
        {
            return TrafficOpResult.Fail("NOT_AWAITING");
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

        // A late / duplicated report can arrive after an EXTEND: what lies ahead is far from the pose but is
        // exactly what the robot is about to drive, so it must stay held.
        var ahead = ResourcesAhead(robot);
        var cleared = robot.OccupiedResourceIds
            .Where(rid => !robot.ServiceHoldIds.Contains(rid) && !ahead.Contains(rid)
                && IsPhysicallyClear(robot, rid, poseX, poseY))
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
    /// <param name="commandId">Stage-3: the NAVIGATE that finished; a result of another command is ignored.</param>
    /// <param name="poseX">Fresh localized pose at the result (null = unknown: nothing is released).</param>
    public TrafficOpResult CompleteRoute(
        Guid robotId, bool succeeded, string? reason, Guid? authorityId = null,
        Guid? commandId = null, double? poseX = null, double? poseY = null)
    {
        var robot = GetOrCreate(robotId);
        var previous = robot.Authority;
        // A late / duplicate result of an older NAVIGATE must not finish (or quarantine) the current route (T12).
        if (authorityId is Guid id && previous is not null && previous.AuthorityId != id)
        {
            Log($"route-complete-ignored:{robotId}:{id}");
            return TrafficOpResult.Fail("AUTHORITY_MISMATCH");
        }

        if (commandId is Guid cmd && robot.ActiveCommandId is Guid active && active != cmd)
        {
            Log($"route-complete-ignored:{robotId}:cmd:{cmd}");
            return TrafficOpResult.Fail("COMMAND_MISMATCH");
        }

        robot.ActiveCommandId = null;
        if (poseX is double px && poseY is double py)
        {
            robot.X = px;
            robot.Y = py;
            // Arrived: it stands at the goal heading (within the goal's yaw tolerance, which the margin covers).
            if (succeeded && robot.RouteGoal is { } arrived
                && Math.Sqrt(Math.Pow(px - arrived.X, 2) + Math.Pow(py - arrived.Y, 2)) <= 0.15)
            {
                robot.YawAt = (px, py, arrived.Yaw);
            }
        }
        else if (_graph is null)
        {
            // Semantic: the stored pose is the start of the last plan, not where the robot is now. Releasing against it
            // could free the cells it stands on; without a fresh pose keep everything (verified exits release later).
            robot.X = null;
            robot.Y = null;
        }

        ClearRoute(robot);
        // The route is over: it waits for nothing any more. A queue entry left behind (a cancelled NAVIGATE that was
        // waiting for cells) made the robot look like it still waited for the robot holding them: a wait-for cycle with
        // a robot standing still, DEADLOCK_RISK for the other one forever (MAP-ONE-V016 sim, 2026-11-23).
        RemoveFromAllQueues(robot.RobotId);
        robot.BlockingOwner = null;
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

        if (!string.Equals(_graph.GraphHash, candidate.GraphHash, StringComparison.Ordinal)
            || !string.Equals(robot.Authority.GraphHash, candidate.GraphHash, StringComparison.Ordinal))
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("GRAPH_MISMATCH"));
        }

        if (robot.Phase == TrafficRobotPhase.Quarantined)
        {
            return Cache(candidate.RequestId, AcquireResult.Reject("QUARANTINED"));
        }

        // Extension is hold-and-wait: the robot keeps its current segment while asking for the next one, so two
        // robots facing each other at adjacent safe stops would each hold what the other needs (audit T3).
        if (WouldCreateWaitForCycle(robot.RobotId, candidate.ResourceIds))
        {
            robot.WaitingReason = TrafficWaitingReason.DeadlockRisk;
            Log($"deadlock-reject-extend:{robot.RobotId}");
            return Cache(candidate.RequestId, AcquireResult.Reject("DEADLOCK_RISK", TrafficWaitingReason.DeadlockRisk));
        }

        if (!CanAcquire(candidate.ResourceIds, robot.RobotId, out var blocker, out var waitReason))
        {
            robot.BlockingOwner = blocker;
            robot.WaitingReason = waitReason;
            return Cache(candidate.RequestId, AcquireResult.Queue(waitReason, blocker));
        }

        if (!ReserveExits(candidate.ExitSafeStops, robot.RobotId, out var exitBlocker))
        {
            robot.BlockingOwner = exitBlocker;
            robot.WaitingReason = TrafficWaitingReason.ExitBlocked;
            return Cache(candidate.RequestId,
                AcquireResult.Queue(TrafficWaitingReason.ExitBlocked, exitBlocker, "EXIT_BLOCKED"));
        }

        robot.BlockingOwner = null;
        robot.WaitingReason = TrafficWaitingReason.None;
        Occupy(robot, candidate.ResourceIds);
        var prev = robot.Authority;
        var cumulativeEdges = prev.EdgeIds.Concat(candidate.EdgeIds).Distinct().ToImmutableArray();
        var cumulativeResources = prev.ResourceIds.Concat(candidate.ResourceIds)
            .Distinct(StringComparer.Ordinal).ToImmutableArray();
        robot.LastSeq++;
        robot.ProgressFloorSeq = robot.LastSeq;
        var maneuvers = candidate.Maneuvers.IsDefaultOrEmpty
            ? ManeuverStepBuilder.Build(_graph, candidate.EdgeIds)
            : candidate.Maneuvers;
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
            candidate.GraphHash,
            maneuvers);
        robot.Authority = authority;
        robot.YawAt = null; // it may turn now: the standing heading is known again once it reports it
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

        if (!localizationOk)
        {
            Quarantine(robot, "EXIT_UNCERTAIN");
            return TrafficOpResult.Fail("EXIT_UNCERTAIN");
        }

        if (_graph is null && _semantic is null)
        {
            Quarantine(robot, "EXIT_UNCERTAIN");
            return TrafficOpResult.Fail("EXIT_UNCERTAIN");
        }

        robot.X = poseX;
        robot.Y = poseY;
        robot.LocalizationOk = true;

        // Semantic: do not release resources still inside the lookahead horizon from the current pose.
        // If the robot has left the proposed path (nearest vertex farther than horizon), treat as no ahead set.
        HashSet<string>? stillAhead = null;
        if (_semantic is not null && !robot.ProposedPath.IsDefaultOrEmpty)
        {
            var (fromPose, nearestDist) = TrimProposedPathFromPose(robot.ProposedPath, poseX, poseY);
            if (nearestDist <= _semantic.HorizonMeters + 0.5)
            {
                stillAhead = SemanticReservation.CollectResources(_semantic, fromPose)
                    .ToHashSet(StringComparer.Ordinal);
            }
        }

        // Station / service holds are released by their workflow step, never by a progress report. Each reported
        // resource is judged on its own: one still under the footprint (or still ahead on the path) stays held, the
        // others are released — a batch with one early report must not pin everything the robot really left.
        var exits = resourceIds
            .Where(rid => !robot.ServiceHoldIds.Contains(rid) && robot.OccupiedResourceIds.Contains(rid))
            .Where(rid => stillAhead is null || !stillAhead.Contains(rid))
            .Where(rid => IsPhysicallyClear(robot, rid, poseX, poseY))
            .ToImmutableArray();

        // Zone chain: the robot only reports cells (it does not know the zones). A zone it has left, and that is not
        // ahead of it on its plan, is released with this report: the next robot may drive in behind it.
        if (_semantic is { UsesZoneChain: true } && stillAhead is not null)
        {
            var leftZones = robot.OccupiedResourceIds
                .Where(rid => rid.StartsWith("zone:", StringComparison.Ordinal)
                              && TrafficZones.Find(_semantic.TrafficZones, rid) is not null
                              && !robot.ServiceHoldIds.Contains(rid)
                              && !stillAhead.Contains(rid)
                              && !exits.Contains(rid)
                              && IsPhysicallyClear(robot, rid, poseX, poseY))
                .ToList();
            if (leftZones.Count > 0)
            {
                Log($"zone-chain-left:{robotId}:{string.Join(",", leftZones)}");
                exits = exits.AddRange(leftZones);
            }
        }

        if (exits.IsEmpty)
        {
            return TrafficOpResult.Fail("NOT_CLEARED");
        }

        foreach (var rid in exits)
        {
            ReleaseResource(robot, rid);
        }

        resourceIds = exits;

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

    /// <summary>Fault Injection Lab (TRA-01): the owner of cells held by a phantom (no robot behind it).</summary>
    public static readonly Guid LabPhantomOwner = new("1ab00000-0000-4000-8000-00000000f001");

    /// <summary>
    /// Fault Injection Lab only (Lab:Enabled): a phantom holds every cell of a disc, as a reservation nobody releases
    /// would; robots whose plan crosses it wait with Capacity behind the phantom. <paramref name="hold"/> false lets go
    /// and wakes the waiters.
    /// </summary>
    public TrafficOpResult LabPhantomHold(double x, double y, double radius, bool hold)
    {
        if (_semantic is null)
        {
            return TrafficOpResult.Fail("SEMANTIC_POLICY_UNBOUND");
        }

        var cells = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.DiscCells(x, y, radius, _semantic.CellSizeMeters, cells);
        foreach (var cell in cells)
        {
            if (hold)
            {
                if (!_holders.TryGetValue(cell, out var set))
                {
                    _holders[cell] = set = [];
                }

                set.Add(LabPhantomOwner);
            }
            else if (_holders.TryGetValue(cell, out var set))
            {
                set.Remove(LabPhantomOwner);
                if (set.Count == 0)
                {
                    _holders.Remove(cell);
                }
            }
        }

        StateVersion++;
        Log(string.Create(System.Globalization.CultureInfo.InvariantCulture,
            $"lab-phantom-{(hold ? "hold" : "release")}:{LabPhantomOwner}:x={x:F2} y={y:F2} r={radius:F2} cells={cells.Count}"));
        if (!hold)
        {
            PromoteWaiters(cells);
        }

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

    /// <summary>
    /// N4: drop service holds that are no longer needed, but only after a localized pose proves the footprint
    /// (plus localization margin) has left those resources. Holds listed in <paramref name="keepResourceIds"/>
    /// stay. Safe-stop / CompleteRoute never call this — that is T11 (shelf work must survive mid-route stops).
    /// </summary>
    public TrafficOpResult ReleaseStaleServiceHolds(
        Guid robotId,
        ImmutableArray<string> keepResourceIds,
        double poseX,
        double poseY,
        bool localizationOk)
    {
        var robot = GetOrCreate(robotId);
        if (robot.Phase == TrafficRobotPhase.Quarantined)
        {
            return TrafficOpResult.Fail($"QUARANTINED:{robot.QuarantineReason}");
        }

        if (!localizationOk)
        {
            return TrafficOpResult.Fail("LOCALIZATION");
        }

        robot.X = poseX;
        robot.Y = poseY;
        robot.LocalizationOk = true;
        if (_graph is not null)
        {
            robot.NodeId = RoutePlanner.NearestNode(_graph, poseX, poseY);
        }

        var keep = keepResourceIds.IsDefaultOrEmpty
            ? new HashSet<string>(StringComparer.Ordinal)
            : keepResourceIds.ToHashSet(StringComparer.Ordinal);

        var released = robot.ServiceHoldIds
            .Where(rid => !keep.Contains(rid) && IsPhysicallyClear(robot, rid, poseX, poseY))
            .ToList();

        foreach (var rid in released)
        {
            ReleaseResource(robot, rid);
        }

        if (robot.ServiceHoldIds.Count == 0 && robot.Authority is null)
        {
            robot.Phase = TrafficRobotPhase.Idle;
        }
        else if (robot.ServiceHoldIds.Count > 0 && robot.Authority is null)
        {
            robot.Phase = TrafficRobotPhase.HoldingService;
        }

        if (released.Count > 0)
        {
            StateVersion++;
            Log($"release-stale-holds:{robotId}:{string.Join(",", released)}");
            PromoteWaiters(released);
        }

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

    /// <summary>
    /// Wait-for cycle breaking: the robot keeps only what its verified body stands on. Its grant is revoked (the gate
    /// closes) and what it was granted but never entered is released, so the other robot can back off through it. It
    /// gets no new grant for <paramref name="holdSeconds"/>. Only for a robot that has stood still (it is in a cycle).
    /// </summary>
    public TrafficOpResult ReleaseUnenteredReservation(Guid robotId, double holdSeconds, string reason)
    {
        if (!_robots.TryGetValue(robotId, out var robot) || !robot.LocalizationOk
            || robot.X is not double x || robot.Y is not double y)
        {
            return TrafficOpResult.Fail("POSE_UNKNOWN");
        }

        if (robot.Authority is { } previous)
        {
            RevokeAuthorityKeepOccupancy(robot, reason);
            _pendingEvents.Add(new TrafficEvent(
                TrafficEventKind.AuthorityRevoked, robot.RobotId, string.Empty, previous, previous.CommandId, null,
                robot.JobStepId, null, null, null, null, IsFirstSegment: false));
        }

        robot.HoldGrantsUntil = _clock.GetUtcNow().AddSeconds(Math.Max(0, holdSeconds));
        ReleaseSemanticOccupancyOutside(robot, ResourcesUnder(x, y, StandingYaw(robot, x, y)));
        StateVersion++;
        Log($"release-unentered:{robotId}:{reason}");
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
        robot.ActiveCommandId = null;
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

    /// <summary>MarkBlocked reason of a robot that refused its grant: <c>AUTHORITY_REFUSED:EXPIRED_ON_ARRIVAL</c>.</summary>
    public const string AuthorityRefusedPrefix = "AUTHORITY_REFUSED:";

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

    /// <summary>
    /// Verified connectivity recovery (fresh heartbeat / MQTT uplink). Clears OFFLINE and soft navigate faults.
    /// Does not clear localization/pose uncertainty — those require verified pose progress or a reconcile.
    /// With a semantic policy bound, an OFFLINE robot is only trusted again when a fresh localized pose shows it still
    /// stands inside what it holds (or, holding nothing, its spot can be seeded): it may have been pushed or have
    /// driven while unreachable. Otherwise it stays quarantined as RECONNECT_UNVERIFIED (operator / robot reconcile).
    /// </summary>
    public TrafficOpResult MarkOnline(
        Guid robotId, double? poseX = null, double? poseY = null, bool localizationOk = false, double? poseYaw = null)
    {
        var robot = GetOrCreate(robotId);
        NoteYaw(robot, poseX, poseY, poseYaw, localizationOk);
        if (localizationOk && poseX is double seenX && poseY is double seenY)
        {
            robot.SeenAt = (seenX, seenY, _clock.GetUtcNow());
        }

        if (robot.Phase != TrafficRobotPhase.Quarantined)
        {
            SeedIfHoldingNothing(robot, poseX, poseY, localizationOk);
            FollowIdlePose(robot, poseX, poseY, localizationOk);
            return TrafficOpResult.Success();
        }

        var reason = robot.QuarantineReason ?? "";
        // Pose/localization faults need telemetry evidence, not HB alone.
        // AUTHORITY_REFUSED: the robot refused its grant (clock off, wrong map bundle); a heartbeat does not fix that, an
        // operator does (then reconciles the robot). Lifting it on the next heartbeat re-granted and re-refused for ever.
        if (reason is "LOCALIZATION_LOSS" or "RECONCILE_LOCALIZATION" or "POSE_UNCERTAIN"
            or "RECONCILE_UNCERTAIN" or "EXIT_UNCERTAIN" or "RECONNECT_UNVERIFIED" or "RECONCILE_IN_MOTION"
            || reason.StartsWith("BLOCKED:" + AuthorityRefusedPrefix, StringComparison.Ordinal))
        {
            Log($"mark-online-keep:{robot.RobotId}:{reason}");
            return TrafficOpResult.Success();
        }

        if (_semantic is not null && reason.StartsWith("OFFLINE", StringComparison.Ordinal))
        {
            if (!VerifiedWhereItHolds(robot, poseX, poseY, localizationOk))
            {
                robot.QuarantineReason = "RECONNECT_UNVERIFIED";
                StateVersion++;
                Log($"mark-online-unverified:{robot.RobotId}");
                return TrafficOpResult.Fail("RECONNECT_UNVERIFIED");
            }
        }

        // OFFLINE + NAVIGATE:* + CANCEL_* + unknown soft faults: verified HB recovers.
        robot.QuarantineReason = null;
        robot.WaitingReason = TrafficWaitingReason.None;
        robot.BlockingOwner = null;
        robot.Phase = robot.Authority is not null
            ? TrafficRobotPhase.Moving
            : TrafficRobotPhase.Idle;
        StateVersion++;
        Log($"recover-online:{robot.RobotId}:{reason}");
        return TrafficOpResult.Success();
    }

    /// <summary>
    /// A robot that came online after start-up (or was released by an operator) occupies the floor it stands on even
    /// before its first MOVE: seed it from its verified pose so no other robot is granted through it. A conflict
    /// (someone already holds that spot) quarantines it as SEED_CONFLICT.
    /// </summary>
    private void SeedIfHoldingNothing(RobotRuntime robot, double? poseX, double? poseY, bool localizationOk)
    {
        if (!_ready || _semantic is null || robot.OccupiedResourceIds.Count > 0 || robot.Authority is not null
            || !localizationOk || poseX is not double x || poseY is not double y)
        {
            return;
        }

        robot.X = x;
        robot.Y = y;
        robot.LocalizationOk = true;
        var under = ResourcesUnder(x, y, StandingYaw(robot, x, y));
        if (!TryOccupy(robot, under, out var reason))
        {
            Quarantine(robot, $"SEED_CONFLICT:{reason}");
            return;
        }

        StateVersion++;
        Log($"seed-online:{robot.RobotId}:n={under.Length}");
    }

    /// <summary>
    /// An idle robot (no grant, no command) holds what its body stands on NOW. Its seed can be taken from a pose that
    /// is no longer true: on LOCALIZE the robot reports its state with the provisional AMCL pose (0, 0) a moment before
    /// the pose jumps to the endpoint the operator placed it at, and nothing re-seeded it while it stood still. On
    /// MAP-ONE-V013 (2026-11-22) RBT-001, parked at EP-PARKING-A, kept ZONE-SINGLE-CENTER and the cells around (0, 0),
    /// so RBT-002 at EP-PARKING-B could never seed (SEED_CONFLICT, quarantined, invisible to traffic). On every fresh
    /// heartbeat pose: what lies clear of the body is released, what the body covers and is free is taken.
    /// </summary>
    private void FollowIdlePose(RobotRuntime robot, double? poseX, double? poseY, bool localizationOk)
    {
        // Also while it holds a service resource (stopped at a pick/drop stop inside a Job): it stands still there.
        if (!_ready || _semantic is null || robot.Phase is not (TrafficRobotPhase.Idle or TrafficRobotPhase.HoldingService)
            || robot.Authority is not null
            || robot.ActiveCommandId is not null || robot.OccupiedResourceIds.Count == 0
            || !localizationOk || poseX is not double x || poseY is not double y)
        {
            return;
        }

        robot.X = x;
        robot.Y = y;
        var standingYaw = StandingYaw(robot, x, y);
        var under = ResourcesUnder(x, y, standingYaw);
        var keep = under.Concat(robot.ServiceHoldIds).ToHashSet(StringComparer.Ordinal);
        // With its heading known (it stands still, see StandingYaw) a cell outside the body rectangle is clear: it does
        // not turn before its next grant. The any-heading circle kept a robot done at EP-SHELF-C-1 holding 34 cells
        // (0.7 x 0.6 m), across the way of the robot heading for INBOUND (sim V019 2026-11-24).
        var released = robot.OccupiedResourceIds
            .Where(rid => !keep.Contains(rid)
                          && ((standingYaw is not null && rid.StartsWith("cell:", StringComparison.Ordinal))
                              || IsPhysicallyClear(robot, rid, x, y)))
            .ToList();
        foreach (var rid in released)
        {
            ReleaseResource(robot, rid);
        }

        var missing = under.Where(rid => !robot.OccupiedResourceIds.Contains(rid)).ToList();
        var taken = missing.Count > 0 && TryOccupy(robot, missing, out _);
        if (released.Count == 0 && !taken)
        {
            return;
        }

        StateVersion++;
        Log($"follow-idle-pose:{robot.RobotId}:released={released.Count}:taken={(taken ? missing.Count : 0)}");
        PromoteWaiters(released);
    }

    private bool VerifiedWhereItHolds(RobotRuntime robot, double? poseX, double? poseY, bool localizationOk)
    {
        if (!localizationOk || poseX is not double x || poseY is not double y)
        {
            return false;
        }

        var radius = _semantic!.FootprintRadiusMeters + Math.Max(0, _options.LocalizationMarginMeters);
        var under = new HashSet<string>(StringComparer.Ordinal);
        // The same shape it holds while it stands (StandingCells), so what it seeded is what is checked here.
        SemanticReservation.StandingCells(_semantic, x, y, StandingYaw(robot, x, y), _options.EffectiveStandingMargin, under);
        foreach (var z in _semantic.SingleOccupancyZones.Where(z => SemanticReservation.DiscHitsZone(x, y, radius, z.Ring)))
        {
            under.Add($"zone:{z.Code}");
        }

        if (robot.OccupiedResourceIds.Count == 0)
        {
            // Held nothing: its spot must still be free to seed.
            if (!TryOccupy(robot, ResourcesUnder(x, y, StandingYaw(robot, x, y)), out _))
            {
                return false;
            }
        }
        else if (!under.IsSubsetOf(robot.OccupiedResourceIds))
        {
            return false;
        }

        robot.X = x;
        robot.Y = y;
        robot.LocalizationOk = true;
        return true;
    }

    /// <summary>
    /// Active MOVE start (audit T1). Never releases occupancy and never lifts a quarantine: what the robot holds
    /// from its previous move or station hold stays held. A robot the coordinator has not seen yet (host restart,
    /// first move) is seeded with the resources under its footprint so its physical spot is reserved.
    /// </summary>
    public TrafficOpResult EnsureTracked(Guid robotId, double? poseX, double? poseY, bool localizationOk, double? poseYaw = null)
    {
        if (!_open)
        {
            return TrafficOpResult.Fail("NOT_LEADER"); // standby host: nothing may start from here
        }

        // Semantic mode binds zone/cell policy and no RouteGraph (BindSemanticPolicy marks the state Ready
        // without one), so tracking must not depend on a compiled graph there.
        if (_graph is null && _semantic is null)
        {
            return TrafficOpResult.Fail("NO_GRAPH");
        }

        var robot = GetOrCreate(robotId);
        NoteYaw(robot, poseX, poseY, poseYaw, localizationOk);
        if (robot.Phase == TrafficRobotPhase.Quarantined)
        {
            return TrafficOpResult.Fail($"QUARANTINED:{robot.QuarantineReason}");
        }

        if (robot.Authority is not null)
        {
            return TrafficOpResult.Fail("AUTHORITY_ALREADY_HELD");
        }

        if (poseX is not double x || poseY is not double y || !localizationOk)
        {
            Quarantine(robot, "POSE_UNCERTAIN");
            return TrafficOpResult.Fail("POSE_UNCERTAIN");
        }

        robot.X = x;
        robot.Y = y;
        robot.LocalizationOk = true;
        robot.NodeId = _graph is null ? null : RoutePlanner.NearestNode(_graph, x, y);
        if (robot.OccupiedResourceIds.Count == 0)
        {
            // Seed what the robot physically stands on, so another robot cannot be granted into it.
            var under = ResourcesUnder(x, y, StandingYaw(robot, x, y));
            if (!TryOccupy(robot, under, out var reason))
            {
                Quarantine(robot, $"SEED_CONFLICT:{reason}");
                return TrafficOpResult.Fail($"SEED_CONFLICT:{reason}");
            }

            Log($"seed:{robotId}:{string.Join(",", under)}");
        }

        StateVersion++;
        return TrafficOpResult.Success();
    }

    /// <summary>
    /// Rebuilds a robot's occupancy from a trusted, localized pose (audit T2): resources the footprint (plus
    /// localization margin) still covers are kept or re-occupied, everything else it held is released only when
    /// physically clear. The robot's authority/route is dropped only when the robot itself reports idle, and only
    /// then is a quarantine lifted — the robot has confirmed it is stopped and where it is.
    /// </summary>
    public TrafficOpResult ReconcileRobot(
        Guid robotId, double poseX, double poseY, bool localizationOk, ImmutableArray<int> occupiedEdges,
        bool robotReportsIdle = true)
    {
        if (_graph is null && _semantic is null)
        {
            return TrafficOpResult.Fail("NO_GRAPH");
        }

        var robot = GetOrCreate(robotId);
        if (!localizationOk)
        {
            // Nothing held and nothing granted: there is no occupancy to protect, so an unlocalized robot
            // (typically one that has just booted and not sent telemetry yet) is simply left untracked.
            if (robot.OccupiedResourceIds.Count == 0 && robot.Authority is null)
            {
                return TrafficOpResult.Fail("LOCALIZATION");
            }

            Quarantine(robot, "RECONCILE_LOCALIZATION");
            return TrafficOpResult.Fail("LOCALIZATION");
        }

        robot.X = poseX;
        robot.Y = poseY;
        robot.LocalizationOk = true;
        robot.NodeId = _graph is null ? null : RoutePlanner.NearestNode(_graph, poseX, poseY);

        if (!robotReportsIdle && (robot.Authority is not null || robot.Phase != TrafficRobotPhase.Quarantined))
        {
            // Robot still executing what we granted, or only waiting for a grant: nothing to rebuild.
            StateVersion++;
            Log($"reconcile-robot:{robotId}:executing");
            return TrafficOpResult.Success();
        }

        var keep = ResourcesUnder(poseX, poseY, StandingYaw(robot, poseX, poseY))
            .Concat(occupiedEdges.Length > 0 && _graph is not null ? _graph.ResourcesCovering(occupiedEdges) : [])
            .Concat(robot.ServiceHoldIds)
            .ToHashSet(StringComparer.Ordinal);

        var released = robot.OccupiedResourceIds
            .Where(rid => !keep.Contains(rid) && IsPhysicallyClear(robot, rid, poseX, poseY))
            .ToList();
        foreach (var rid in released)
        {
            ReleaseResource(robot, rid);
        }

        var missing = keep.Where(rid => !robot.OccupiedResourceIds.Contains(rid)).ToList();
        if (missing.Count > 0 && !TryOccupy(robot, missing, out var reason))
        {
            Quarantine(robot, $"RECONCILE_CONFLICT:{reason}");
            PromoteWaiters(released);
            return TrafficOpResult.Fail(reason ?? "CONFLICT");
        }

        robot.Authority = null;
        robot.ActiveCommandId = null;
        ClearRoute(robot);
        robot.Phase = robot.ServiceHoldIds.Count > 0 ? TrafficRobotPhase.HoldingService : TrafficRobotPhase.Idle;
        robot.QuarantineReason = null;
        robot.WaitingReason = TrafficWaitingReason.None;
        robot.BlockingOwner = null;
        StateVersion++;
        Log($"reconcile-robot:{robotId}:released:{string.Join(",", released)}");
        PromoteWaiters(released);
        return TrafficOpResult.Success();
    }

    /// <summary>
    /// Resources covering authority edges the robot has not finished yet: every edge after the last one that ends at
    /// the node the robot stands at. When that node is not on the authority, everything is treated as ahead.
    /// </summary>
    private HashSet<string> ResourcesAhead(RobotRuntime robot)
    {
        if (_graph is null || robot.Authority is not { } auth || auth.EdgeIds.IsDefaultOrEmpty)
        {
            return new HashSet<string>(StringComparer.Ordinal);
        }

        var reached = -1;
        for (var i = auth.EdgeIds.Length - 1; i >= 0; i--)
        {
            if (_graph.EdgeById.TryGetValue(auth.EdgeIds[i], out var e) && e.EndId == robot.NodeId)
            {
                reached = i;
                break;
            }
        }

        return _graph.ResourcesCovering(auth.EdgeIds.Skip(reached + 1)).ToHashSet(StringComparer.Ordinal);
    }

    /// <summary>Resources whose edges pass within the footprint radius (+ localization margin) of a pose.</summary>
    private ImmutableArray<string> ResourcesAtPose(double x, double y)
    {
        if (_graph is null)
        {
            return [];
        }

        var radius = ClearRadius;
        var edges = _graph.Edges
            .Where(e =>
            {
                var a = _graph.NodeById[e.StartId];
                var b = _graph.NodeById[e.EndId];
                return PointToSegmentDistance(x, y, a.X, a.Y, b.X, b.Y) <= radius;
            })
            .Select(e => e.Id)
            .ToList();
        return _graph.ResourcesCovering(edges);
    }

    private double ClearRadius => (_graph?.Footprint.TurnRadius ?? 0) + Math.Max(0, _options.LocalizationMarginMeters);

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
            .Select(r =>
            {
                var plan = PlanView(r);
                return new RobotTrafficView(
                    r.RobotId,
                    r.Phase,
                    r.NodeId,
                    r.X,
                    r.Y,
                    r.LocalizationOk,
                    r.OccupiedResourceIds.Order(StringComparer.Ordinal).ToImmutableArray(),
                    // A default ImmutableArray cannot be serialized (the snapshot API answered 500 under a grant).
                    r.Authority is { Maneuvers.IsDefault: true } a ? a with { Maneuvers = [] } : r.Authority,
                    r.LastSeq,
                    r.WaitingReason,
                    r.BlockingOwner,
                    r.QuarantineReason,
                    r.JobStepId,
                    r.PlanRevision,
                    plan.Path,
                    plan.GrantedPoints);
            })
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
            .ToList();

        // Stage-3: include held semantic zone/cell resources not present on a compiled graph.
        foreach (var rid in _holders.Keys.OrderBy(x => x, StringComparer.Ordinal))
        {
            if (resources.Any(r => r.ResourceId == rid))
            {
                continue;
            }

            _holders.TryGetValue(rid, out var holders);
            _queues.TryGetValue(rid, out var waiters);
            var kind = rid.StartsWith("zone:", StringComparison.Ordinal)
                ? TrafficResourceKind.Zone
                : TrafficResourceKind.PhysicalOverlap;
            var cap = _semanticCapacities.TryGetValue(rid, out var c) ? c : 1;
            resources.Add(new ResourceTrafficView(
                rid,
                kind,
                cap,
                (holders ?? []).OrderBy(id => id).ToImmutableArray(),
                (waiters ?? []).Select(w => w.RobotId).ToImmutableArray(),
                waiters?.Count ?? 0));
        }

        var resourceViews = resources.ToImmutableArray();

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
            resourceViews,
            waits,
            cycles,
            _events.ToImmutableArray())
        {
            Decisions = _decisions.ToImmutableArray(),
        };
    }

    /// <summary>A decision taken outside the coordinator about a robot's movement (deadlock retreat, goal wait).</summary>
    public void RecordDecision(Guid robotId, string code, string detail) => Log($"{code}:{robotId}:{detail}");

    /// <summary>
    /// What the map draws of a robot's Nav2 plan: the part still ahead of its pose (thinned to ~5 cm steps) while it
    /// has a route open, and how many of those points lie inside what traffic has granted. A waiting robot shows its
    /// whole plan with nothing granted; a robot on a full grant shows it all granted.
    /// </summary>
    private (ImmutableArray<SemanticPlanPose> Path, int GrantedPoints) PlanView(RobotRuntime r)
    {
        if (r.ProposedPath.IsDefaultOrEmpty
            || r.ActiveCommandId is null
            || r.Phase is not (TrafficRobotPhase.Waiting or TrafficRobotPhase.Authorized
                or TrafficRobotPhase.Moving or TrafficRobotPhase.Reconciling))
        {
            return ([], 0);
        }

        var path = r.X is double rx && r.Y is double ry
            ? TrimProposedPathFromPose(r.ProposedPath, rx, ry).Path
            : r.ProposedPath;
        path = ThinPath(path, 0.05);
        if (path.IsDefaultOrEmpty)
        {
            return ([], 0);
        }

        if (r.Authority is not { } auth || r.Phase is TrafficRobotPhase.Waiting)
        {
            return (path, 0);
        }

        if (_semantic is null || r.PartialAuthorityId != auth.AuthorityId || auth.ResourceIds.IsDefaultOrEmpty)
        {
            return (path, path.Length);
        }

        var granted = auth.ResourceIds.ToHashSet(StringComparer.Ordinal);
        var cellSize = _semantic.EffectiveCellSize;
        var count = 0;
        foreach (var p in path)
        {
            var cx = (int)Math.Floor(p.X / cellSize);
            var cy = (int)Math.Floor(p.Y / cellSize);
            if (!granted.Contains(SemanticReservation.CellId(cx, cy)))
            {
                break;
            }

            count++;
        }

        return (path, count);
    }

    /// <summary>Keeps the first, the last and every pose at least <paramref name="step"/> metres from the last kept one.</summary>
    private static ImmutableArray<SemanticPlanPose> ThinPath(ImmutableArray<SemanticPlanPose> path, double step)
    {
        if (path.IsDefaultOrEmpty || path.Length <= 2)
        {
            return path.IsDefault ? [] : path;
        }

        var kept = ImmutableArray.CreateBuilder<SemanticPlanPose>(path.Length);
        kept.Add(path[0]);
        var last = path[0];
        for (var i = 1; i < path.Length - 1; i++)
        {
            var p = path[i];
            if ((p.X - last.X) * (p.X - last.X) + (p.Y - last.Y) * (p.Y - last.Y) >= step * step)
            {
                kept.Add(p);
                last = p;
            }
        }

        kept.Add(path[^1]);
        return kept.ToImmutable();
    }

    private bool _promoting;
    private readonly HashSet<string> _deferredFreed = new(StringComparer.Ordinal);

    /// <summary>
    /// Semantic: every robot still waiting is tried again, on a timer and not only when something is released. A robot
    /// blocked by another robot's BODY (cells that robot did not hold) never saw a release when that robot drove away,
    /// and the robot side does not ask again while it holds part of its plan: it waited until its command timed out.
    /// </summary>
    public int RetrySemanticWaiters()
    {
        if (_semantic is null || !_ready || !_open || _queues.Count == 0)
        {
            return 0;
        }

        var before = StateVersion;
        PromoteWaiters(_queues.Keys.ToList());
        return StateVersion != before ? 1 : 0;
    }

    private void PromoteWaiters(IEnumerable<string> freedResources)
    {
        if (_promoting)
        {
            // Reached from inside a promotion (the grant released what the robot no longer needs): handled after this
            // pass, so no robot is granted twice inside one pass.
            _deferredFreed.UnionWith(freedResources);
            return;
        }

        _promoting = true;
        try
        {
            var pending = freedResources.ToList();
            for (var pass = 0; pass < 8 && pending.Count > 0; pass++)
            {
                PromoteWaitersOnce(pending);
                pending = _deferredFreed.ToList();
                _deferredFreed.Clear();
            }
        }
        finally
        {
            _promoting = false;
            _deferredFreed.Clear();
        }
    }

    private void PromoteWaitersOnce(IEnumerable<string> freedResources)
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
            if (robot.Phase == TrafficRobotPhase.Quarantined)
            {
                continue;
            }

            if (robot.Authority is not null)
            {
                if (_semantic is not null && robot.PartialAuthorityId == robot.Authority.AuthorityId)
                {
                    TryExtendPartialGrant(robot, new SemanticPlanProposeRequest(
                        Guid.NewGuid(),
                        robot.RobotId,
                        robot.RobotId.ToString("N"),
                        _semantic.SemanticMapFingerprint,
                        robot.PlanRevision,
                        robot.ProposedPath,
                        null,
                        robot.JobStepId,
                        waiter.Candidate.JobId,
                        waiter.Candidate.Priority,
                        robot.PlanHash,
                        robot.ActiveCommandId));
                }

                continue;
            }

            // Semantic waiters: retry from stored ProposedPath (graph AcquireAtomic is N/A).
            if (_semantic is not null
                && !robot.ProposedPath.IsDefaultOrEmpty
                && waiter.Candidate.EdgeIds.IsDefaultOrEmpty)
            {
                var req = new SemanticPlanProposeRequest(
                    Guid.NewGuid(),
                    robot.RobotId,
                    robot.RobotId.ToString("N"),
                    _semantic.SemanticMapFingerprint,
                    robot.PlanRevision,
                    robot.ProposedPath,
                    null,
                    robot.JobStepId,
                    waiter.Candidate.JobId,
                    waiter.Candidate.Priority,
                    robot.PlanHash,
                    robot.ActiveCommandId);
                var semanticResult = AcquireSemanticPlan(req);
                if (semanticResult.Granted)
                {
                    RemoveFromAllQueues(waiter.RobotId);
                }

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

    private void Enqueue(
        RobotRuntime robot,
        RouteSegmentCandidate candidate,
        TrafficWaitingReason reason,
        Guid? blocker,
        ImmutableArray<string> wakeOn = default)
    {
        robot.Phase = TrafficRobotPhase.Waiting;
        robot.WaitingReason = reason;
        robot.BlockingOwner = blocker;
        // A robot that re-proposes while queued keeps its place and its aging (no starvation by re-proposal).
        var existing = FindWaiter(robot.RobotId);
        var waiter = existing is null
            ? new Waiter(robot.RobotId, candidate, reason, blocker, ++_enqueueSeq, _clock.GetUtcNow())
            : new Waiter(robot.RobotId, candidate, reason, blocker, existing.EnqueueSeq, existing.EnqueuedAt);
        RemoveFromAllQueues(robot.RobotId);

        foreach (var rid in candidate.ResourceIds.Concat(wakeOn.IsDefault ? [] : wakeOn).Distinct(StringComparer.Ordinal))
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
        if (_graph is null && _semantic is null)
        {
            return false;
        }

        foreach (var rid in resourceIds)
        {
            int capacity;
            if (_semanticCapacities.TryGetValue(rid, out var semCap))
            {
                capacity = semCap;
            }
            else if (_graph is not null && _graph.ResourceById.TryGetValue(rid, out var res))
            {
                capacity = res.Capacity;
            }
            else if (_semantic is not null && (rid.StartsWith("cell:", StringComparison.Ordinal) || rid.StartsWith("zone:", StringComparison.Ordinal)))
            {
                capacity = 1;
                _semanticCapacities[rid] = 1;
            }
            else
            {
                // Id from another graph (stale candidate after a rebind): never grant what we cannot check.
                reason = TrafficWaitingReason.Capacity;
                return false;
            }

            _holders.TryGetValue(rid, out var holders);
            holders ??= [];
            var others = holders.Where(h => h != robotId).ToList();
            if (others.Count >= capacity)
            {
                blocker = others.OrderBy(id => id).FirstOrDefault();
                reason = TrafficWaitingReason.Capacity;
                return false;
            }
        }

        if (_semantic is not null && BodyInTheWay(resourceIds, robotId) is Guid body)
        {
            blocker = body;
            reason = TrafficWaitingReason.Capacity;
            return false;
        }

        return true;
    }

    /// <summary>
    /// The robot whose BODY stands on one of these cells, whether or not it holds them. A robot normally holds what it
    /// stands on, but one that could not seed (SEED_CONFLICT / RECONCILE_CONFLICT quarantine, or a seed retried every
    /// second) holds nothing, and was then invisible: on the real floor (MAP-ONE-V013, 2026-11-22) RBT-001 was granted
    /// a path straight through RBT-002 parked and quarantined at EP-PARKING-B and drove to 5 cm of it. Cells under the
    /// asking robot's own body are left out, so two robots that already stand too close can still move apart.
    /// </summary>
    private Guid? BodyInTheWay(ImmutableArray<string> resourceIds, Guid robotId)
    {
        if (_semantic is null || resourceIds.IsDefaultOrEmpty)
        {
            return null;
        }

        var radius = _semantic.FootprintRadiusMeters + Math.Max(0, _options.LocalizationMarginMeters);
        HashSet<string>? own = null;
        foreach (var other in _robots.Values)
        {
            // A robot that lost its localization is still somewhere: its last pose, at any heading and with the
            // localization margin, stays in the way. Skipping it made it invisible to every grant.
            if (other.RobotId == robotId || other.X is not double ox || other.Y is not double oy)
            {
                continue;
            }

            var body = new HashSet<string>(StringComparer.Ordinal);
            if (other.LocalizationOk)
            {
                SemanticReservation.StandingCells(_semantic, ox, oy, StandingYaw(other, ox, oy), _options.EffectiveStandingMargin, body);
            }
            else
            {
                SemanticReservation.DiscCells(ox, oy, radius, _semantic.EffectiveCellSize, body);
            }

            // Zone chain: the zone it stands in is taken while it is there, held or not (quarantined, never seeded).
            if (SemanticReservation.StandingZoneResource(_semantic, ox, oy) is { } standingZone)
            {
                body.Add(standingZone);
            }

            body.ExceptWith(other.OccupiedResourceIds); // what it holds is already counted by capacity
            if (body.Count == 0)
            {
                continue;
            }

            if (own is null)
            {
                own = new HashSet<string>(StringComparer.Ordinal);
                if (_robots.TryGetValue(robotId, out var me) && me.X is double mx && me.Y is double my)
                {
                    SemanticReservation.DiscCells(mx, my, radius, _semantic.EffectiveCellSize, own); // it may turn: any heading
                }
            }

            body.ExceptWith(own);
            if (resourceIds.Any(body.Contains))
            {
                return other.RobotId;
            }
        }

        return null;
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

    private static (ImmutableArray<SemanticPlanPose> Path, double NearestDist) TrimProposedPathFromPose(
        ImmutableArray<SemanticPlanPose> path,
        double x,
        double y)
    {
        if (path.IsDefaultOrEmpty || path.Length == 0)
        {
            return (path, double.PositiveInfinity);
        }

        var best = 0;
        var bestD2 = double.MaxValue;
        for (var i = 0; i < path.Length; i++)
        {
            var dx = path[i].X - x;
            var dy = path[i].Y - y;
            var d2 = dx * dx + dy * dy;
            if (d2 < bestD2)
            {
                bestD2 = d2;
                best = i;
            }
        }

        return (path[best..], Math.Sqrt(bestD2));
    }

    private bool IsPhysicallyClear(RobotRuntime robot, string resourceId, double x, double y)
    {
        // Zone chain: a robot is in the zone its centre is in (a slot inside a corridor wins over the corridor), the
        // same rule it holds zones by. The body circle against the ring kept a robot standing at EP-QUEUE-B, a slot
        // inside the right column, holding the whole column for ever (sim V022 2026-11-24). Its body cells still hold
        // what it covers there.
        if (_semantic is { UsesZoneChain: true } && resourceId.StartsWith("zone:", StringComparison.Ordinal)
            && TrafficZones.Find(_semantic.TrafficZones, resourceId) is not null)
        {
            return SemanticReservation.StandingZoneResource(_semantic, x, y) != resourceId;
        }

        if (_semantic is not null && resourceId.StartsWith("zone:", StringComparison.Ordinal)
            && _semantic.SingleOccupancyZones.FirstOrDefault(z => $"zone:{z.Code}" == resourceId) is { } zone)
        {
            // Same rule as the zone test of a standing robot / a plan (half length + margin, not the any-heading circle):
            // RBT-002 seeded at the provisional pose (0, 0) during LOCALIZE never let go of ZONE-SINGLE-CENTER from
            // EP-PARKING-B, 0.248 m below it, because the circle (0.287 m) still touched it (MAP-ONE-V013, 2026-11-22).
            var r = Math.Max(_semantic.FootprintHalfLength, _semantic.FootprintHalfWidth) + Math.Max(0, _options.LocalizationMarginMeters);
            return !SemanticReservation.DiscHitsZone(x, y, r, zone.Ring);
        }

        if (_semantic is not null
            && (resourceId.StartsWith("cell:", StringComparison.Ordinal)
                || resourceId.StartsWith("zone:", StringComparison.Ordinal)
                || resourceId.StartsWith("bay:", StringComparison.Ordinal)))
        {
            // Footprint at any heading, grown by the localization uncertainty (fail closed: too small releases early).
            return SemanticReservation.IsPhysicallyClearOfResources(
                _semantic, x, y, [resourceId], margin: Math.Max(0, _options.LocalizationMarginMeters),
                standingYaw: StandingYaw(robot, x, y));
        }

        if (_graph is null || !_graph.ResourceById.TryGetValue(resourceId, out var res))
        {
            return false;
        }

        // Clear when the footprint circle, grown by the localization margin, touches no edge of the resource.
        var radius = ClearRadius;
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
            // A robot with no route (idle, holding a service stop, quarantined) waits for nobody: an idle robot's leftover BlockingOwner made a fake
            // cycle (R2 idle, R1 waiting for its cells) and R1 backed off on the spot for ever (sim 2026-11-23, V017).
            // The asking robot's own old edge is replaced by what it asks for now (below): keeping it made a cycle out
            // of a wait it had already given up (false DEADLOCK_RISK).
            if (r.RobotId != robotId
                && r.Phase is not (TrafficRobotPhase.Idle or TrafficRobotPhase.HoldingService or TrafficRobotPhase.Quarantined)
                && r.BlockingOwner is Guid b)
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
            if (r.Phase is not (TrafficRobotPhase.Idle or TrafficRobotPhase.HoldingService or TrafficRobotPhase.Quarantined) && r.BlockingOwner is Guid b)
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
        // Occupancy stays held — no auto-release.
        RemoveFromAllQueues(robot.RobotId);

        // Stop the robot through the traffic channel (audit T13). Kept only where revoking cannot help:
        // LOCALIZATION_LOSS recovers in place while the authority is held, OFFLINE cannot be reached (its own
        // authority watchdog stops it, authority_state reconciles on reconnect).
        if (robot.Authority is { } authority
            && !reason.StartsWith("LOCALIZATION_LOSS", StringComparison.Ordinal)
            && !reason.StartsWith("OFFLINE", StringComparison.Ordinal))
        {
            _pendingEvents.Add(new TrafficEvent(
                TrafficEventKind.AuthorityRevoked, robot.RobotId, string.Empty, authority, null, null,
                robot.JobStepId, null, null, null, null, IsFirstSegment: false));
            robot.Authority = null;
            ClearRoute(robot);
        }

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

        var now = _clock.GetUtcNow();
        _events.Enqueue($"{now:O}|{message}");
        if (TrafficDecisionClassifier.TryClassify(message, out var d))
        {
            if (_decisions.Count >= _eventCap)
            {
                _decisions.Dequeue();
            }

            _decisions.Enqueue(new TrafficDecision(++_decisionSeq, now, d.RobotId, d.Kind, d.Code, d.Severity, d.Detail));
        }
    }

    private sealed class RobotRuntime(Guid robotId)
    {
        /// <summary>Gave way in a wait-for cycle: no grant before this time.</summary>
        public DateTimeOffset? HoldGrantsUntil { get; set; }

        public Guid RobotId { get; } = robotId;
        public TrafficRobotPhase Phase { get; set; } = TrafficRobotPhase.Idle;
        public int? NodeId { get; set; }
        public double? X { get; set; }
        public double? Y { get; set; }
        /// <summary>Heading reported at a pose while standing still (null after any grant: it may turn).</summary>
        public (double X, double Y, double Yaw)? YawAt { get; set; }
        /// <summary>Last fresh localized pose from a heartbeat (the pose the robot gate checks), with when it came.</summary>
        public (double X, double Y, DateTimeOffset At)? SeenAt { get; set; }
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
        public long PlanRevision { get; set; }
        public string? PlanHash { get; set; }
        /// <summary>Stage-3: the backend NAVIGATE the robot's proposals belong to.</summary>
        public Guid? ActiveCommandId { get; set; }
        public ImmutableArray<SemanticPlanPose> ProposedPath { get; set; } = [];
        /// <summary>The current authority covers only the start of the plan; the robot is also queued for the rest.</summary>
        public Guid? PartialAuthorityId { get; set; }
    }

    private sealed record Waiter(
        Guid RobotId,
        RouteSegmentCandidate Candidate,
        TrafficWaitingReason Reason,
        Guid? BlockingOwner,
        long EnqueueSeq,
        DateTimeOffset EnqueuedAt);
}
