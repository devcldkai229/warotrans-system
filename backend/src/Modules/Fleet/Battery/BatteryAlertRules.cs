namespace WaroTrans.Fleet.Battery;

public enum BatteryAlertTransition
{
    NONE,
    LOW,
    CRITICAL,
    RECOVERED
}

/// <summary>
/// Pure rule for the battery notifications: raised once when SOC enters a band (not on every reading), resolved
/// once SOC is back above Low + hysteresis. An unknown SOC (null) never raises anything.
/// </summary>
public static class BatteryAlertRules
{
    public static BatteryAlertTransition Evaluate(decimal? before, decimal? after, BatteryOptions options)
    {
        if (after is not { } now)
        {
            return BatteryAlertTransition.NONE;
        }

        if (now <= options.CriticalPercent && (before is null || before > options.CriticalPercent))
        {
            return BatteryAlertTransition.CRITICAL;
        }

        if (now <= options.LowPercent && now > options.CriticalPercent
            && (before is null || before > options.LowPercent))
        {
            return BatteryAlertTransition.LOW;
        }

        var recovered = options.LowPercent + options.RecoverHysteresisPercent;
        if (now > recovered && before is { } previous && previous <= recovered)
        {
            return BatteryAlertTransition.RECOVERED;
        }

        return BatteryAlertTransition.NONE;
    }
}
