using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.IntegrationEvents;

public sealed record RobotConnectivityChanged(
    Guid RobotId,
    string RobotCode,
    bool IsOnline,
    RobotStatus Status,
    DateTimeOffset? LastHeartbeatAt) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
