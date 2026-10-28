using System.Collections.Immutable;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Segmented safe-stop traffic coordinator (Shadow Mode observes; Active Mode deferred).
/// All mutations go through a single-writer Channel actor.
/// </summary>
public interface ISegmentedTrafficCoordinator
{
    long Epoch { get; }

    /// <summary>Fails with GRAPH_IN_USE when switching graphs while any robot holds occupancy or authority.</summary>
    Task<TrafficOpResult> BindGraphAsync(Guid mapVersionId, CompiledTrafficGraph graph, CancellationToken ct = default);

    /// <summary>
    /// Active MOVE start: makes sure the coordinator tracks the robot. Never releases occupancy and never lifts a
    /// quarantine; an untracked robot is seeded with the resources under its pose.
    /// </summary>
    Task<TrafficOpResult> EnsureTrackedAsync(
        Guid robotId, double? poseX, double? poseY, bool localizationOk, CancellationToken ct = default);

    /// <summary>Accepted STOPPED_AWAITING_AUTHORITY at the authority's goal safe stop arms the next EXTEND.</summary>
    Task<TrafficOpResult> ReportStoppedAwaitingAsync(
        Guid robotId, long seq, long epoch, double? poseX, double? poseY, bool localizationOk, CancellationToken ct = default);

    Task CompleteReconciliationAsync(IReadOnlyList<TrafficReconcileSeed> seeds, CancellationToken ct = default);

    Task<RoutePlanResult> RequestRouteAsync(RoutePlanRequest request, CancellationToken ct = default);

    Task<AcquireResult> AcquireAtomicAsync(RouteSegmentCandidate candidate, long? epoch = null, long? seq = null, CancellationToken ct = default);

    Task<AcquireResult> ExtendAtomicAsync(RouteSegmentCandidate candidate, long? epoch = null, CancellationToken ct = default);

    Task<RoutePlanResult> RequestSegmentAsync(RoutePlanRequest request, CancellationToken ct = default);

    /// <summary>Active Mode: acquire the first segment and keep the rest of the route for <see cref="AdvanceRouteAsync"/>.</summary>
    Task<AcquireResult> AcquireRouteAsync(
        ImmutableArray<RouteSegmentCandidate> segments, TrafficRouteGoal goal, long? epoch = null, CancellationToken ct = default);

    /// <summary>Active Mode: robot stopped awaiting authority → EXTEND with the next pending segment.</summary>
    Task<TrafficOpResult> AdvanceRouteAsync(Guid robotId, CancellationToken ct = default);

    Task<TrafficOpResult> ReportSafeStopReachedAsync(
        Guid robotId, long seq, long epoch, double poseX, double poseY, bool localizationOk, CancellationToken ct = default);

    /// <summary>
    /// NAVIGATE result for an Active route: success clears authority, otherwise quarantine. A result for another
    /// authority than the current one (late / duplicate) is ignored.
    /// </summary>
    Task<TrafficOpResult> CompleteRouteAsync(
        Guid robotId, bool succeeded, string? reason, Guid? authorityId = null, CancellationToken ct = default);

    Task<TrafficOpResult> RenewAuthorityAsync(Guid robotId, Guid authorityId, long epoch, CancellationToken ct = default);

    /// <summary>Active Mode: renew every robot that currently holds a segment authority.</summary>
    Task<int> RenewAllActiveAuthoritiesAsync(CancellationToken ct = default);

    Task<TrafficOpResult> ReportProgressAsync(
        Guid robotId, long seq, long epoch, int? nodeId, double? x, double? y, bool localizationOk,
        CancellationToken ct = default);

    Task<TrafficOpResult> ReportVerifiedExitAsync(
        Guid robotId, long seq, long epoch, ImmutableArray<string> resourceIds, double poseX, double poseY, bool localizationOk,
        CancellationToken ct = default);

    Task<TrafficOpResult> HoldServiceResourceAsync(Guid robotId, string resourceId, CancellationToken ct = default);

    Task<TrafficOpResult> ReleaseAfterPhysicalClearanceAsync(
        Guid robotId, string operatorId, ImmutableArray<string>? resourceIds = null, CancellationToken ct = default);

    Task<TrafficOpResult> CancelRequestAsync(Guid robotId, Guid? requestId = null, CancellationToken ct = default);

    Task<TrafficOpResult> MarkBlockedAsync(Guid robotId, string reason, CancellationToken ct = default);

    Task<TrafficOpResult> MarkOfflineAsync(Guid robotId, CancellationToken ct = default);

    /// <summary>
    /// Rebuilds occupancy from a trusted pose: keeps what the robot's footprint (plus margin) still covers, releases
    /// only what it has physically left. Lifts a quarantine only when the robot reports idle and localized.
    /// </summary>
    Task<TrafficOpResult> ReconcileRobotAsync(
        Guid robotId, double poseX, double poseY, bool localizationOk, ImmutableArray<int> occupiedEdges,
        bool robotReportsIdle = true, CancellationToken ct = default);

    Task<TrafficSnapshot> GetTrafficSnapshotAsync(CancellationToken ct = default);
}
