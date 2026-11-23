namespace WaroTrans.BuildingBlocks.Abstractions;

/// <summary>An issue raised by a workflow step (HUMAN REPORT_ISSUE), not typed in by hand.</summary>
/// <param name="JobStepId">Idempotency key: the same step never creates two issues.</param>
public sealed record StepIssueDraft(
    Guid JobStepId,
    Guid JobId,
    string JobNo,
    string StepKey,
    Guid? ReportedBy,
    Guid? RobotId,
    Guid? ContainerId,
    string Description);

/// <summary>
/// An issue the system raises for a situation someone has to resolve by hand (e.g. a request cancelled while its
/// containers are on a robot). <paramref name="SourceKey"/> is the idempotency key: the same situation opens one issue.
/// </summary>
public sealed record SystemIssueDraft(
    string SourceKey,
    Guid JobId,
    string JobNo,
    Guid? ReportedBy,
    Guid? RobotId,
    Guid? ContainerId,
    string Description,
    bool High = false,
    Guid? TransportRequestId = null);

/// <summary>
/// A container problem seen at a handover or at inspection, by a person (a CONTAINER issue with its problem code).
/// <paramref name="SourceKey"/> is the idempotency key.
/// </summary>
/// <param name="Defects">Every problem seen (inspection may find several); <paramref name="ProblemCode"/> is the first.</param>
/// <param name="RemovedFromJob">The container was taken off its Job ("Container failed", a failed inspection).</param>
/// <param name="HeldAtEndpointId">Where the container was set down, when it left the robot there.</param>
public sealed record ContainerProblemDraft(
    string SourceKey,
    Guid JobId,
    string JobNo,
    Guid? JobStepId,
    string? StepKey,
    Guid ContainerId,
    Guid? TransportRequestId,
    Guid? RobotId,
    Guid? ReportedBy,
    string ProblemCode,
    IReadOnlyList<string> Defects,
    string Description,
    bool RemovedFromJob,
    Guid? HeldAtEndpointId = null);

/// <summary>Implemented by Operations; lets WorkflowExecution open an IssueReport without referencing Operations (WFX-05).</summary>
public interface IIssueReporter
{
    /// <returns>The issue id; the existing one when this source key already raised an issue.</returns>
    Task<Guid> ReportContainerProblemAsync(ContainerProblemDraft draft, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException("Container problems are not reported here.");

    /// <returns>The issue id; the existing one when this step already raised an issue.</returns>
    Task<Guid> ReportFromStepAsync(StepIssueDraft draft, CancellationToken cancellationToken = default);

    /// <returns>The issue id; the existing one when this source key already raised an issue.</returns>
    Task<Guid> ReportAsync(SystemIssueDraft draft, CancellationToken cancellationToken = default);

    Task<bool> HasBlockingHandoverIssueAsync(Guid jobId, IReadOnlyCollection<Guid> containerIds, CancellationToken cancellationToken = default) =>
        Task.FromResult(false);
}

/// <summary>Validates a handover issue against its Job and its real Warehouse barcode.</summary>
public interface IHandoverIssueVerifier
{
    /// <summary>Holds the Job lock until the caller has stored the issue, so confirmation and reporting are serialized.</summary>
    Task<IAsyncDisposable?> LockSubjectAsync(Guid jobId, Guid containerId, Guid? jobStepId, CancellationToken cancellationToken);

    Task<bool> BarcodeMatchesAsync(Guid containerId, string barcode, CancellationToken cancellationToken);
}
