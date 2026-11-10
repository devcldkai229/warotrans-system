namespace WaroTrans.Fleet.Features.Dispatch;

/// <summary>HW-04 battery policy (Fleet:Battery). Percentages are of the estimated state of charge.</summary>
public sealed class BatteryOptions
{
    public const string SectionName = "Fleet:Battery";

    public decimal LowPercent { get; set; } = 20m;
    public decimal CriticalPercent { get; set; } = 10m;

    /// <summary>Below this a robot is not given new work.</summary>
    public decimal MinDispatchPercent { get; set; } = 30m;

    /// <summary>A reading older than this is stale: the robot may have drained since.</summary>
    public int StaleSeconds { get; set; } = 15;

    /// <summary>
    /// Whether a robot that never reported a battery value (no sensor yet) may be dispatched automatically.
    /// Off by default: an operator can still dispatch it with an override and a reason.
    /// </summary>
    public bool AllowUnknownBatteryDispatch { get; set; }
}

/// <summary>FL-01 scoring weights (Fleet:Dispatch). Lower score = better candidate.</summary>
public sealed class DispatchOptions
{
    public const string SectionName = "Fleet:Dispatch";

    /// <summary>Score per metre between the robot and the pickup endpoint.</summary>
    public double DistanceWeight { get; set; } = 1.0;

    /// <summary>Score per missing battery percent (100 − SoC).</summary>
    public double BatteryWeight { get; set; } = 0.05;

    /// <summary>Score subtracted for a robot that has been idle for <see cref="IdleCapSeconds"/> or longer.</summary>
    public double IdleBonus { get; set; } = 0.5;

    public int IdleCapSeconds { get; set; } = 600;
}
