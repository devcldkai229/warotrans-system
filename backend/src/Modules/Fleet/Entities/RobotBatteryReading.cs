using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

/// <summary>Battery part of one telemetry message. <see cref="Percent"/> null = unknown, never 0.</summary>
public sealed record RobotBatteryReading(
    decimal? Percent,
    decimal? Voltage = null,
    BatteryEstimationMode? Mode = null,
    BatteryConfidence? Confidence = null,
    BatteryChargingState? ChargingState = null)
{
    public static RobotBatteryReading Unknown { get; } = new(null, Mode: BatteryEstimationMode.UNAVAILABLE);
}
