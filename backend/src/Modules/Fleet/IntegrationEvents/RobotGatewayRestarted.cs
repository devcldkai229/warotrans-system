using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Fleet.IntegrationEvents;

/// <summary>The robot's gateway process restarted while the robot stayed online: its in-memory state is gone.</summary>
public sealed record RobotGatewayRestarted(Guid RobotId, string RobotCode) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
