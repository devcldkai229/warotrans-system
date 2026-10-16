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
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>Job status changed (e.g. RUNNING, COMPLETED, FAILED). Consumed by realtime UI.</summary>
public sealed record JobStatusChanged(
    Guid JobId,
    string JobNo,
    string Status,
    Guid? RobotId,
    string? FailureCode) : IIntegrationEvent
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
