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

/// <summary>Implemented by Operations; lets WorkflowExecution open an IssueReport without referencing Operations (WFX-05).</summary>
public interface IIssueReporter
{
    /// <returns>The issue id; the existing one when this step already raised an issue.</returns>
    Task<Guid> ReportFromStepAsync(StepIssueDraft draft, CancellationToken cancellationToken = default);
}
