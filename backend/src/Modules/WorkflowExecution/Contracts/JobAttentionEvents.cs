using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// A job has been waiting for somebody to start it (run it on a robot) for longer than the configured time.
/// Raised again on every check while it waits; the receiver decides how often a person hears about it.
/// </summary>
public sealed record JobWaitingToStart(Guid JobId, string JobNo, DateTimeOffset WaitingSince) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// A HUMAN_INTERACTION step has been waiting for a person to confirm it for longer than the configured time.
/// Raised again on every check while it waits.
/// </summary>
public sealed record JobStepWaitingForPerson(
    Guid JobId,
    string JobNo,
    Guid JobStepId,
    string StepName,
    DateTimeOffset WaitingSince) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
