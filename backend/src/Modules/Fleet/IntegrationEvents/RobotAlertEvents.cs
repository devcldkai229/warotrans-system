using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Fleet.IntegrationEvents;

/// <summary>
/// A robot's known battery SOC just dropped to or below <c>Fleet:Battery:LowPercent</c> (not to Critical) and the
/// robot is not in CHARGING status. Raised once per drop, not on every reading. Unknown SOC never raises it.
/// </summary>
public sealed record RobotBatteryLow(Guid RobotId, string RobotCode, decimal BatteryPercent) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>A robot's known battery SOC just dropped to or below <c>Fleet:Battery:CriticalPercent</c>.</summary>
public sealed record RobotBatteryCritical(Guid RobotId, string RobotCode, decimal BatteryPercent) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

/// <summary>A robot's battery SOC is back above Low + hysteresis: its battery notifications can be resolved.</summary>
public sealed record RobotBatteryRecovered(Guid RobotId, string RobotCode, decimal BatteryPercent) : IIntegrationEvent
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
