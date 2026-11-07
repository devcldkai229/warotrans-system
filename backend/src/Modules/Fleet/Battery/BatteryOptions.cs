namespace WaroTrans.Fleet.Battery;

/// <summary>Configuration under <c>Fleet:Battery</c>. Percentages are 0..100.</summary>
public sealed class BatteryOptions
{
    public const string SectionName = "Fleet:Battery";

    /// <summary>Warning notification at or below this SOC.</summary>
    public decimal LowPercent { get; set; } = 20m;

    /// <summary>Error notification at or below this SOC.</summary>
    public decimal CriticalPercent { get; set; } = 10m;

    /// <summary>Automatic dispatch needs at least this SOC.</summary>
    public decimal MinDispatchPercent { get; set; } = 30m;

    /// <summary>The low/critical notification resolves once SOC is back above LowPercent + this.</summary>
    public decimal RecoverHysteresisPercent { get; set; } = 5m;

    /// <summary>A known SOC older than this (or from an offline robot) is stale.</summary>
    public int StaleAfterSeconds { get; set; } = 15;

    /// <summary>
    /// Supervised development only: lets robots with an UNKNOWN or stale battery take Jobs. Never bypasses a
    /// known SOC below <see cref="MinDispatchPercent"/>. Keep false in production
    /// (env <c>Fleet__Battery__AllowUnknownBatteryDispatch=true</c> to enable explicitly).
    /// </summary>
    public bool AllowUnknownBatteryDispatch { get; set; }
}
