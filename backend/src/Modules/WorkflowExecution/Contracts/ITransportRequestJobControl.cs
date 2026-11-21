namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>A Job that carries containers of a TransportRequest, as Transportation needs to see it.</summary>
public sealed record RequestJobState(Guid JobId, string JobNo, string Status, Guid TransportRequestId)
{
    /// <summary>The Job never ran: nothing moved, nothing was picked up.</summary>
    public bool NotStarted => Status is "CREATED" or "QUEUED";

    public bool Terminal => Status is "COMPLETED" or "FAILED" or "CANCELLED";
}

/// <summary>TRN-03: one Job of a request as the cancellation follows it (robot, hold, each container).</summary>
public sealed record RequestJobCancellationView(
    Guid JobId,
    string JobNo,
    string Status,
    string? FailureCode,
    Guid? RobotId,
    string? RobotCode,
    bool RobotOnline,
    bool RobotMotionHeld,
    IReadOnlyList<RequestJobContainerView> Containers,
    string Phase = CancelRobotPhases.Unknown,
    Guid? RecoveryEndpointId = null,
    string? RecoveryEndpointCode = null,
    bool RobotLocalized = false,
    bool RobotTelemetryFresh = false,
    bool CanSendToRecovery = false)
{
    public bool Terminal => Status is "COMPLETED" or "FAILED" or "CANCELLED";

    /// <summary>The robot knows where it is and reports it now: it may be asked to drive somewhere.</summary>
    public bool RobotCanNavigate => RobotOnline && RobotLocalized && RobotTelemetryFresh;
}

/// <summary>
/// TRN-03 destination policy: where the robot of a cancelled Job is in its trip, which decides where it goes next.
/// </summary>
public static class CancelRobotPhases
{
    public const string Unknown = "UNKNOWN";

    /// <summary>Not started (no robot, or the robot has not moved for it): it stays parked.</summary>
    public const string NotStarted = "NOT_STARTED";

    /// <summary>On the way to a pickup, nothing on board: afterwards to a wait point or parking, whichever is nearer.</summary>
    public const string ToPickup = "TO_PICKUP";

    /// <summary>Standing at a pickup stop.</summary>
    public const string AtPickup = "AT_PICKUP";

    /// <summary>Carrying containers between stops: a recovery (wait / queue) point is where the cargo is dealt with.</summary>
    public const string InTransit = "IN_TRANSIT";

    /// <summary>At its drop-off with the unload not confirmed: the containers are reconciled before anything else.</summary>
    public const string AtDropoff = "AT_DROPOFF";

    /// <summary>Driving to a recovery point with the cargo.</summary>
    public const string ToRecovery = "TO_RECOVERY";

    /// <summary>Holding still at a recovery point: unload by scan there.</summary>
    public const string AtRecovery = "AT_RECOVERY";

    /// <summary>The Job is over for this robot.</summary>
    public const string Done = "DONE";
}

/// <summary>A wait / queue point a robot with cancelled cargo may be sent to (Wait = Queue = Recovery Point).</summary>
public sealed record RecoveryPointView(Guid EndpointId, string Code, string Name, bool Free, double? DistanceMeters);

/// <summary>Where a robot was sent after its cancelled Job: SENT, NOT_NEEDED, RETRY (try again soon) or SKIPPED.</summary>
public sealed record RobotDestinationResult(string Status, string? EndpointCode, string? Note)
{
    public const string Sent = "SENT";
    public const string NotNeeded = "NOT_NEEDED";
    public const string Retry = "RETRY";
    public const string Skipped = "SKIPPED";
}

public sealed record RequestJobContainerView(
    Guid ContainerId,
    Guid TransportRequestId,
    string Status,
    string? FailureCode,
    DateTimeOffset? LoadedAt,
    DateTimeOffset? DeliveredAt);

/// <summary>Result of taking one container off a held robot by hand (TRN-03).</summary>
public sealed record CancelHandoverResult(Guid JobId, Guid ContainerId, bool AlreadyHandedOver, bool JobCancelled);

/// <summary>What cancelling a request did to one of its containers (WH-04).</summary>
public sealed record ContainerCancelOutcome(Guid ContainerId, Guid JobId, string Outcome)
{
    /// <summary>Not picked up yet: cancelled, the warehouse is unchanged.</summary>
    public const string Cancelled = "CANCELLED";

    /// <summary>Its Job has cargo on the robot: the Job is paused for recovery, nothing is treated as returned.</summary>
    public const string RecoveryRequired = "RECOVERY_REQUIRED";

    /// <summary>The Job has no remaining work for this container.</summary>
    public const string AlreadyFinished = "ALREADY_FINISHED";

    /// <summary>The dropoff was confirmed, even when its stock posting is still pending.</summary>
    public const string AlreadyDelivered = "ALREADY_DELIVERED";

    /// <summary>The container was unloaded by scan after the cancel.</summary>
    public const string AlreadyHandedOver = "ALREADY_HANDED_OVER";
}

public sealed record PendingStockHandover(
    Guid JobId, Guid ContainerId, bool IsPickup, DateTimeOffset ConfirmedAt, DateTimeOffset? NextAttemptAt);

/// <summary>
/// Lets Transportation fan a request-level cancel / reject out to the Jobs that carry it (TRN-01 / TRN-02) without
/// referencing the WorkflowExecution internals. Implemented by WorkflowExecution.
/// </summary>
public interface ITransportRequestJobControl
{
    /// <summary>Jobs per request, for the given requests (requests without Jobs are absent).</summary>
    Task<IReadOnlyDictionary<Guid, IReadOnlyList<RequestJobState>>> GetJobsAsync(
        IReadOnlyCollection<Guid> transportRequestIds,
        CancellationToken cancellationToken = default);

    /// <summary>Confirmed handovers still awaiting Transportation's durable stock queue.</summary>
    Task<IReadOnlyList<PendingStockHandover>> GetPendingStockHandoversAsync(
        Guid transportRequestId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cancels every unfinished Job of the request. A Job with containers ONBOARD is not cancelled: its robot is
    /// stopped, the Job is PAUSED with <c>request_cancelled_cargo_onboard</c> and an issue is opened, because the cargo
    /// still has to be unloaded or delivered by someone. Safe to call again.
    /// </summary>
    Task<IReadOnlyList<ContainerCancelOutcome>> CancelForRequestAsync(
        Guid transportRequestId,
        string reason,
        CancellationToken cancellationToken = default);

    /// <summary>TRN-03: each Job of the request with its robot and containers, for the cancellation progress.</summary>
    Task<IReadOnlyList<RequestJobCancellationView>> GetCancellationViewAsync(
        Guid transportRequestId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// TRN-03: cancels these containers of the request before they are picked up; the rest of their Jobs go on.
    /// 409 <c>detail_already_picked_up</c> when one is on a robot or delivered.
    /// </summary>
    Task<IReadOnlyList<ContainerCancelOutcome>> CancelContainersBeforePickupAsync(
        Guid transportRequestId,
        IReadOnlyCollection<Guid> containerIds,
        string reason,
        CancellationToken cancellationToken = default);

    /// <summary>TRN-03: a person took this container off its held robot and scanned it.</summary>
    Task<CancelHandoverResult> HandOverCancelledCargoAsync(
        Guid jobId,
        Guid transportRequestId,
        Guid containerId,
        string? scannedBarcode,
        Guid actor,
        string? note,
        CancellationToken cancellationToken = default);

    /// <summary>TRN-03: deliver the cargo anyway: resumes the held Job, which now only drops off what is on board.</summary>
    Task DeliverCancelledCargoAsync(Guid jobId, Guid actor, CancellationToken cancellationToken = default);

    /// <summary>TRN-03 destination policy: the wait / queue points this Job's robot could take its cargo to, nearest first.</summary>
    Task<IReadOnlyList<RecoveryPointView>> GetRecoveryPointsAsync(Guid jobId, CancellationToken cancellationToken = default);

    /// <summary>
    /// TRN-03: the held robot drives its cargo to a recovery point (the nearest free one when none is given), through
    /// traffic like any MOVE, and holds still there to be unloaded by scan. Returns the point's code.
    /// </summary>
    Task<string> SendCancelledCargoToRecoveryAsync(Guid jobId, Guid? endpointId, Guid actor, CancellationToken cancellationToken = default);

    /// <summary>
    /// TRN-03: the robot of a finished cancellation goes to parking (or, when it was on its way to a pickup, to the nearer
    /// of a wait point and parking). Never sends a robot that is held, lost, busy or already parked.
    /// </summary>
    Task<RobotDestinationResult> SendRobotAfterCancelAsync(Guid robotId, bool allowWaitPoint, CancellationToken cancellationToken = default);
}
