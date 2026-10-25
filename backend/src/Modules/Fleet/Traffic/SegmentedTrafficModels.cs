using System.Collections.Immutable;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

public enum TrafficRobotPhase
{
    Idle,
    Waiting,
    Authorized,
    Moving,
    HoldingService,
    Quarantined,
    Reconciling
}

public enum TrafficWaitingReason
{
    None,
    Capacity,
    ExitBlocked,
    DeadlockRisk,
    QuarantinedPeer,
    Overloaded,
    Reconciling,
    ShadowSingleMover
}

public sealed record MotionAuthority(
    Guid AuthorityId,
    Guid RobotId,
    int StartSafeStopNodeId,
    int GoalSafeStopNodeId,
    ImmutableArray<int> EdgeIds,
    ImmutableArray<string> ResourceIds,
    ImmutableArray<int> ReservedExitSafeStops,
    long Seq,
    long Epoch,
    string GraphHash);

public sealed record RobotTrafficView(
    Guid RobotId,
    TrafficRobotPhase Phase,
    int? NodeId,
    double? X,
    double? Y,
    bool LocalizationOk,
    ImmutableArray<string> OccupiedResourceIds,
    MotionAuthority? Authority,
    long LastSeq,
    TrafficWaitingReason WaitingReason,
    Guid? BlockingOwner,
    string? QuarantineReason,
    Guid? JobStepId);

public sealed record ResourceTrafficView(
    string ResourceId,
    TrafficResourceKind Kind,
    int Capacity,
    ImmutableArray<Guid> Holders,
    ImmutableArray<Guid> Waiters,
    int QueueLength);

public sealed record TrafficWaitDiagnostics(
    Guid RobotId,
    string ResourceId,
    TrafficWaitingReason Reason,
    Guid? BlockingOwner,
    double EffectivePriority,
    long EnqueueSeq);

public sealed record TrafficCycleDiagnostics(
    ImmutableArray<Guid> RobotCycle);

public sealed record TrafficSnapshot(
    long Epoch,
    long StateVersion,
    string Phase,
    ImmutableArray<RobotTrafficView> Robots,
    ImmutableArray<ResourceTrafficView> Resources,
    ImmutableArray<TrafficWaitDiagnostics> Waits,
    ImmutableArray<TrafficCycleDiagnostics> Cycles,
    ImmutableArray<string> RecentEvents);

public sealed record RoutePlanRequest(
    Guid RequestId,
    Guid RobotId,
    Guid MapVersionId,
    CompiledTrafficGraph Graph,
    double PoseX,
    double PoseY,
    string? GoalEndpointCode,
    int? GoalNodeId,
    int Priority = 0,
    Guid? JobStepId = null,
    Guid? JobId = null);

public sealed record RouteSegmentCandidate(
    Guid RequestId,
    Guid RobotId,
    Guid MapVersionId,
    string GraphHash,
    int StartSafeStopNodeId,
    int GoalSafeStopNodeId,
    ImmutableArray<int> EdgeIds,
    ImmutableArray<string> ResourceIds,
    ImmutableArray<int> ExitSafeStops,
    double Cost,
    long BasedOnStateVersion,
    int Priority,
    Guid? JobStepId,
    Guid? JobId);

public sealed record RoutePlanResult(
    bool Ok,
    string? Reason,
    ImmutableArray<int> FullEdgeIds,
    ImmutableArray<RouteSegmentCandidate> Segments,
    ImmutableArray<ImmutableArray<int>> Alternatives)
{
    public static RoutePlanResult Unreachable(string reason) =>
        new(false, reason, [], [], []);

    public static RoutePlanResult OkPlan(
        ImmutableArray<int> full,
        ImmutableArray<RouteSegmentCandidate> segments,
        ImmutableArray<ImmutableArray<int>> alternatives) =>
        new(true, null, full, segments, alternatives);
}

public sealed record AcquireResult(
    bool Granted,
    bool Queued,
    string? Reason,
    MotionAuthority? Authority,
    TrafficWaitingReason WaitingReason,
    Guid? BlockingOwner)
{
    public static AcquireResult Grant(MotionAuthority authority) =>
        new(true, false, null, authority, TrafficWaitingReason.None, null);

    public static AcquireResult Queue(TrafficWaitingReason reason, Guid? blocker, string? detail = null) =>
        new(false, true, detail, null, reason, blocker);

    public static AcquireResult Reject(string reason, TrafficWaitingReason waiting = TrafficWaitingReason.None) =>
        new(false, false, reason, null, waiting, null);
}

public sealed record TrafficOpResult(bool Ok, string? Reason)
{
    public static TrafficOpResult Success() => new(true, null);
    public static TrafficOpResult Fail(string reason) => new(false, reason);
}

/// <summary>Seed used at Host start to rebuild occupancy (fail-closed).</summary>
public sealed record TrafficReconcileSeed(
    Guid RobotId,
    Guid? JobStepId,
    ImmutableArray<int> OccupiedEdgeIds,
    double? PoseX,
    double? PoseY,
    bool LocalizationOk,
    bool PoseKnown);
