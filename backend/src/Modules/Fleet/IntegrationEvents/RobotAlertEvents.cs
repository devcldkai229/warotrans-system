using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Fleet.IntegrationEvents;

/// <summary>
/// A robot's battery just dropped to or below <see cref="Features.GetRobotStatistics.GetRobotStatisticsHandler.LowBatteryPercent"/>
/// while it is not charging. Raised once per drop (the telemetry before it was above the threshold), not on every reading.
/// </summary>
public sealed record RobotBatteryLow(Guid RobotId, string RobotCode, decimal BatteryPercent) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>A robot started reporting an error code it was not reporting before.</summary>
public sealed record RobotErrorReported(Guid RobotId, string RobotCode, string ErrorCode) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
