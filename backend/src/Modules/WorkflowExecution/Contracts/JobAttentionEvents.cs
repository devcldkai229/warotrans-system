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
/// <summary>WH-03: a human step nobody holds any more (claim released or expired). Anyone may take it.</summary>
public sealed record HumanTaskOffered(
    Guid JobId,
    string JobNo,
    Guid JobStepId,
    string StepName,
    Guid? PreviousClaimant) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>SY-02: a human step passed its deadline. Raised once per step; it stays waiting until a person acts.</summary>
public sealed record HumanStepOverdue(
    Guid JobId,
    string JobNo,
    Guid JobStepId,
    string StepName,
    Guid? ClaimedBy,
    DateTimeOffset DeadlineAt) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

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
