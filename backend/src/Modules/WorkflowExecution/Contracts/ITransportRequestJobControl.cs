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
    IReadOnlyList<RequestJobContainerView> Containers)
{
    public bool Terminal => Status is "COMPLETED" or "FAILED" or "CANCELLED";
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

    /// <summary>Already delivered (or failed) before the cancel: left as it is.</summary>
    public const string AlreadyFinished = "ALREADY_FINISHED";
}

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
}
