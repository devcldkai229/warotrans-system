namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>A Job that carries containers of a TransportRequest, as Transportation needs to see it.</summary>
public sealed record RequestJobState(Guid JobId, string JobNo, string Status, Guid TransportRequestId)
{
    /// <summary>The Job never ran: nothing moved, nothing was picked up.</summary>
    public bool NotStarted => Status is "CREATED" or "QUEUED";

    public bool Terminal => Status is "COMPLETED" or "FAILED" or "CANCELLED";
}

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
}
