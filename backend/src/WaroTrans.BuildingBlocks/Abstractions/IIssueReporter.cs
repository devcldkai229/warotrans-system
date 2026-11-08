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

/// <summary>Implemented by Operations; lets WorkflowExecution open an IssueReport without referencing Operations (WFX-05).</summary>
public interface IIssueReporter
{
    /// <returns>The issue id; the existing one when this step already raised an issue.</returns>
    Task<Guid> ReportFromStepAsync(StepIssueDraft draft, CancellationToken cancellationToken = default);

    /// <returns>The issue id; the existing one when this source key already raised an issue.</returns>
    Task<Guid> ReportAsync(SystemIssueDraft draft, CancellationToken cancellationToken = default);
}
