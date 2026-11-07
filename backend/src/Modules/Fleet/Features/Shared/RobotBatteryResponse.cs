using WaroTrans.Fleet.Battery;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.Shared;

/// <summary>
/// Battery as clients see it. <see cref="Percent"/> null = UNKNOWN (show "Unknown", never 0 %).
/// <see cref="DispatchStatus"/>: ELIGIBLE | UNKNOWN | STALE | LOW for automatic Job dispatch.
/// </summary>
public sealed record RobotBatteryResponse(
    decimal? Percent,
    decimal? Voltage,
    BatteryEstimationMode EstimationMode,
    BatteryConfidence? Confidence,
    BatteryChargingState ChargingState,
    DateTimeOffset? UpdatedAt,
    bool IsStale,
    BatteryDispatchStatus DispatchStatus,
    bool DispatchAllowed)
{
    public static RobotBatteryResponse From(Robot robot, BatteryOptions options, DateTimeOffset utcNow)
    {
        var decision = BatteryDispatchPolicy.Evaluate(robot, utcNow, options);
        return new RobotBatteryResponse(
            robot.BatteryPercent,
            robot.BatteryVoltage,
            robot.BatteryEstimationMode ?? (robot.BatteryPercent is null
                ? BatteryEstimationMode.UNAVAILABLE
                : BatteryEstimationMode.REPORTED),
            robot.BatteryConfidence,
            robot.BatteryChargingState ?? BatteryChargingState.UNKNOWN,
            robot.BatteryUpdatedAt,
            decision.IsStale,
            decision.Status,
            decision.Allowed);
    }
}
