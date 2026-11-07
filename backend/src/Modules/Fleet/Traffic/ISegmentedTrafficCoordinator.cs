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

    /// <summary>Stage-3: bind semantic zone/cell policy (fingerprint). Fails SEMANTIC_IN_USE when occupied.</summary>
    Task<TrafficOpResult> BindSemanticPolicyAsync(SemanticTrafficPolicy policy, CancellationToken ct = default);

    /// <summary>Stage-3: Nav2 path proposal → exclusive zone/cell grant (no RouteGraph A*).</summary>
    Task<AcquireResult> AcquireSemanticPlanAsync(SemanticPlanProposeRequest request, CancellationToken ct = default);

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
        Guid robotId, bool succeeded, string? reason, Guid? authorityId = null, CancellationToken ct = default,
        Guid? commandId = null, double? poseX = null, double? poseY = null);

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

    /// <summary>
    /// Releases service holds not in <paramref name="keepResourceIds"/> when the robot pose is physically clear
    /// of those resources (N4). Does not run on safe-stop alone (T11).
    /// </summary>
    Task<TrafficOpResult> ReleaseStaleServiceHoldsAsync(
        Guid robotId,
        ImmutableArray<string> keepResourceIds,
        double poseX,
        double poseY,
        bool localizationOk,
        CancellationToken ct = default);

    Task<TrafficOpResult> ReleaseAfterPhysicalClearanceAsync(
        Guid robotId, string operatorId, ImmutableArray<string>? resourceIds = null, CancellationToken ct = default);

    Task<TrafficOpResult> CancelRequestAsync(Guid robotId, Guid? requestId = null, CancellationToken ct = default);

    Task<TrafficOpResult> MarkBlockedAsync(Guid robotId, string reason, CancellationToken ct = default);

    Task<TrafficOpResult> MarkOfflineAsync(Guid robotId, CancellationToken ct = default);

    /// <summary>Clear OFFLINE quarantine after a verified fresh heartbeat (not traffic_plan).</summary>
    Task<TrafficOpResult> MarkOnlineAsync(
        Guid robotId, CancellationToken ct = default, double? poseX = null, double? poseY = null, bool localizationOk = false);

    /// <summary>
    /// Lease takeover: a new epoch strictly above every earlier one, occupancy rebuilt from the seeds. Whatever this
    /// host knew before it held the lease is void; robots drop older grants when the epoch is announced.
    /// </summary>
    Task<long> TakeOverAsync(IReadOnlyList<TrafficReconcileSeed> seeds, CancellationToken ct = default);

    /// <summary>Opens/closes grants: one coordinator per resource domain (lease) that has announced its epoch.</summary>
    Task SetOpenForGrantsAsync(bool open, string reason, CancellationToken ct = default);

    /// <summary>
    /// Rebuilds occupancy from a trusted pose: keeps what the robot's footprint (plus margin) still covers, releases
    /// only what it has physically left. Lifts a quarantine only when the robot reports idle and localized.
    /// </summary>
    Task<TrafficOpResult> ReconcileRobotAsync(
        Guid robotId, double poseX, double poseY, bool localizationOk, ImmutableArray<int> occupiedEdges,
        bool robotReportsIdle = true, CancellationToken ct = default);

    Task<TrafficSnapshot> GetTrafficSnapshotAsync(CancellationToken ct = default);
}
