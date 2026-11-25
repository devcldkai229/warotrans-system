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

/// <summary>A person confirmed the charger is plugged in: the robot is CHARGING and is given no work.</summary>
public sealed record RobotChargingStarted(Guid RobotId, string RobotCode, decimal? BatteryPercent) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// The battery of a charging robot is full: someone has to unplug the charger (manual charging). Raised once per charge,
/// and once more as a <paramref name="Reminder"/> when nobody unplugged it after Fleet:Battery:UnplugReminderMinutes.
/// </summary>
public sealed record RobotChargeFull(Guid RobotId, string RobotCode, decimal? BatteryPercent, bool Reminder) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>A person confirmed the charger is unplugged: the robot is AVAILABLE again.</summary>
public sealed record RobotChargingEnded(Guid RobotId, string RobotCode, decimal? BatteryPercent) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
