using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// In-memory all-or-nothing route grants over compiled traffic resources (lane / zone / junction / corridor).
/// Process-local singleton — not persisted. FIFO wait when contended.
/// </summary>
public interface ITrafficCoordinator
{
    /// <summary>
    /// Tries to lock every resource covering the shortest path. When contended, enqueues FIFO
    /// and returns <see cref="RouteGrantResult.WaitQueued"/>; a later release may promote the waiter
    /// into <see cref="TakeReadyNavigates"/>.
    /// </summary>
    RouteGrantResult TryAcquireRouteGrant(
        Guid robotId,
        Guid mapVersionId,
        CompiledTrafficGraph graph,
        int startNodeId,
        int goalNodeId,
        Guid jobStepId,
        PendingNavigateContext? pendingNavigate = null);

    void ReleaseGrant(Guid robotId);

    void ReleaseByJobStep(Guid jobStepId);

    void ReleaseAllForOfflineRobot(Guid robotId);

    /// <summary>Drains waiters that became granted after a release (for <see cref="TrafficGrantHostedService"/>).</summary>
    IReadOnlyList<ReadyNavigateGrant> TakeReadyNavigates();
}

public sealed record RouteGrantResult(
    bool Granted,
    string? GraphHash,
    IReadOnlyList<int> EdgeIds,
    bool WaitQueued)
{
    public static RouteGrantResult Immediate(string graphHash, IReadOnlyList<int> edgeIds) =>
        new(true, graphHash, edgeIds, false);

    public static RouteGrantResult Queued(string graphHash, IReadOnlyList<int> edgeIds) =>
        new(false, graphHash, edgeIds, true);

    public static RouteGrantResult Failed() =>
        new(false, null, Array.Empty<int>(), false);
}

/// <summary>Pose / job context kept while a MOVE waits for a traffic grant.</summary>
public sealed record PendingNavigateContext(
    Guid JobId,
    double X,
    double Y,
    double Yaw,
    string FrameId = "map");

/// <summary>A previously queued grant that is now held and ready for NAVIGATE_TO_POSE.</summary>
public sealed record ReadyNavigateGrant(
    Guid RobotId,
    Guid JobId,
    Guid JobStepId,
    double X,
    double Y,
    double Yaw,
    string FrameId,
    string GraphHash,
    IReadOnlyList<int> EdgeIds);
