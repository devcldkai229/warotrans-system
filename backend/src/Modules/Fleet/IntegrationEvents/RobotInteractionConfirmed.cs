using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Fleet.IntegrationEvents;

/// <summary>
/// Fleet validated robotCode exists; WorkflowExecution owns JobStep validation and completion.
/// </summary>
public sealed record RobotInteractionConfirmed(
    Guid RobotId,
    string RobotCode,
    Guid MessageId,
    Guid JobId,
    Guid JobStepId,
    string InteractionType,
    Guid ContainerId,
    Guid EndpointId,
    DateTimeOffset SentAt) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
