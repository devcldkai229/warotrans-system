using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Fleet.IntegrationEvents;

/// <summary>
/// Fault Injection Lab (Lab:Enabled, test robots only): a fault was deliberately injected. Evidence files it under the
/// request's journal so a replay shows where the test started; the AI's evidence never includes it (it would give the
/// answer away), it is kept for grading only.
/// </summary>
/// <param name="Executor">ROBOT (the gateway does it), HOST (the backend does it) or OPERATOR (a person does it).</param>
public sealed record LabFaultInjected(
    Guid InjectionId,
    string ScenarioId,
    string Title,
    string Executor,
    Guid? RobotId,
    string? RobotCode,
    Guid? TransportRequestId,
    int TtlSeconds,
    IReadOnlyDictionary<string, string> Parameters,
    string? InjectedBy) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <param name="Outcome">STOPPED (by a person), EXPIRED (TTL) or FAILED (could not be applied).</param>
public sealed record LabFaultCleared(
    Guid InjectionId,
    string ScenarioId,
    Guid? RobotId,
    string? RobotCode,
    Guid? TransportRequestId,
    string Outcome,
    string? Detail) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
