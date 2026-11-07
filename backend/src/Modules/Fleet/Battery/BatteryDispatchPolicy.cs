using WaroTrans.Fleet.Entities;

namespace WaroTrans.Fleet.Battery;

public enum BatteryDispatchStatus
{
    ELIGIBLE,
    UNKNOWN,
    STALE,
    LOW
}

public sealed record BatteryDispatchDecision(BatteryDispatchStatus Status, bool Allowed, bool IsStale);

/// <summary>Pure rule: may this robot's battery take a new Job?</summary>
public static class BatteryDispatchPolicy
{
    public static bool IsStale(Robot robot, DateTimeOffset utcNow, BatteryOptions options) =>
        robot.BatteryPercent is null
        || !robot.IsOnline
        || robot.BatteryUpdatedAt is not { } updatedAt
        || utcNow - updatedAt > TimeSpan.FromSeconds(options.StaleAfterSeconds);

    public static BatteryDispatchDecision Evaluate(Robot robot, DateTimeOffset utcNow, BatteryOptions options)
    {
        var stale = IsStale(robot, utcNow, options);
        var status = robot.BatteryPercent switch
        {
            null => BatteryDispatchStatus.UNKNOWN,
            // A known low SOC stays LOW even when stale: the override must never let it through.
            { } percent when percent < options.MinDispatchPercent => BatteryDispatchStatus.LOW,
            _ when stale => BatteryDispatchStatus.STALE,
            _ => BatteryDispatchStatus.ELIGIBLE
        };
        var allowed = status == BatteryDispatchStatus.ELIGIBLE
            || (options.AllowUnknownBatteryDispatch
                && status is BatteryDispatchStatus.UNKNOWN or BatteryDispatchStatus.STALE);
        return new BatteryDispatchDecision(status, allowed, stale);
    }
}
