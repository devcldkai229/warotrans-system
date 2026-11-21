using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// A JobContainer moved through its lifecycle (ASSIGNED → ONBOARD → DELIVERED | FAILED | CANCELLED).
/// Transportation maps it onto the matching TransportRequestDetail (TransportRequestId + ContainerId).
/// </summary>
public sealed record JobContainerStatusChanged(
    Guid JobId,
    Guid TransportRequestId,
    Guid ContainerId,
    string Status) : IIntegrationEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; init; } = DateTimeOffset.UtcNow;
    public Guid? HandoverConfirmedBy { get; init; }
    public string? FailureCode { get; init; }
}

/// <summary>Job status changed (e.g. RUNNING, COMPLETED, FAILED). Consumed by realtime UI.</summary>
public sealed record JobStatusChanged(
    Guid JobId,
    string JobNo,
    string Status,
    Guid? RobotId,
    string? FailureCode,
    Guid? MapVersionId = null) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>A JobStep changed status (EXECUTING, WAITING, COMPLETED, FAILED …). Consumed by realtime UI.</summary>
public sealed record JobStepStatusChanged(
    Guid JobId,
    Guid JobTaskId,
    Guid JobStepId,
    string StepKey,
    string Status,
    string? ErrorCode) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A robot got (OPENED) or lost (CLOSED) a Job: a row of execution.job_robot_assignments was written. One row is one
/// robot running one trip, so its <see cref="AssignmentId"/> keys that run for listeners outside the module
/// (Evidence). <see cref="EndReason"/> is the Job status that ended it, or REASSIGNED; values as stored, never mapped.
/// </summary>
public sealed record JobRobotAssignmentChanged(
    Guid AssignmentId,
    Guid JobId,
    string JobNo,
    Guid RobotId,
    string Phase,
    string StartReason,
    DateTimeOffset StartedAt,
    DateTimeOffset? EndedAt,
    string? EndReason) : IIntegrationEvent
{
    public const string Opened = "OPENED";
    public const string Closed = "CLOSED";

    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
