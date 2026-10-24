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

    Task BindGraphAsync(Guid mapVersionId, CompiledTrafficGraph graph, CancellationToken ct = default);

    Task CompleteReconciliationAsync(IReadOnlyList<TrafficReconcileSeed> seeds, CancellationToken ct = default);

    Task<RoutePlanResult> RequestRouteAsync(RoutePlanRequest request, CancellationToken ct = default);

    Task<AcquireResult> AcquireAtomicAsync(RouteSegmentCandidate candidate, long? epoch = null, long? seq = null, CancellationToken ct = default);

    Task<RoutePlanResult> RequestSegmentAsync(RoutePlanRequest request, CancellationToken ct = default);

    Task<TrafficOpResult> RenewAuthorityAsync(Guid robotId, Guid authorityId, long seq, long epoch, CancellationToken ct = default);

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

    Task<TrafficOpResult> ReconcileRobotAsync(
        Guid robotId, double poseX, double poseY, bool localizationOk, ImmutableArray<int> occupiedEdges,
        CancellationToken ct = default);

    Task<TrafficSnapshot> GetTrafficSnapshotAsync(CancellationToken ct = default);
}
