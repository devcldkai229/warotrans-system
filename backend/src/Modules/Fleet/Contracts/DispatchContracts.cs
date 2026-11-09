namespace WaroTrans.Fleet.Contracts;

/// <summary>FL-01: stable reason codes a robot is not (automatically) eligible for new work.</summary>
public static class DispatchReasons
{
    public const string Disabled = "robot_disabled";
    public const string Offline = "robot_offline";
    public const string InMaintenance = "robot_in_maintenance";
    public const string NotAvailable = "robot_not_available";
    public const string MotionHeld = "robot_motion_held";
    public const string ManualMode = "robot_in_manual_mode";
    public const string MapMismatch = "robot_map_mismatch";
    public const string NotLocalized = "robot_not_localized";
    public const string Busy = "robot_busy";
    public const string BatteryLow = "battery_low";
    public const string BatteryUnknown = "battery_unknown";
    public const string BatteryStale = "battery_stale";

    /// <summary>
    /// The only reasons an operator override (dispatch.override + a reason) may skip: the battery is not known to be
    /// low, only not known. Safety, maintenance, manual mode and a low battery are never overridable.
    /// </summary>
    public static bool IsOverridable(string reason) => reason is BatteryUnknown or BatteryStale;
}

/// <summary>Where the work starts (the pickup endpoint), for the distance score. Null = score without distance.</summary>
public sealed record DispatchQuery(Guid MapVersionId, double? PickupX, double? PickupY, IReadOnlySet<Guid> BusyRobotIds);

/// <summary>
/// One robot as dispatch saw it: eligible or not and why, with the factors of its score (lower = better).
/// Ineligible robots are listed too, so an operator can see why a robot was not chosen.
/// </summary>
public sealed record DispatchCandidate(
    Guid RobotId,
    string RobotCode,
    bool Eligible,
    IReadOnlyList<string> Reasons,
    decimal? BatteryPercent,
    string BatteryState,
    double? DistanceMeters,
    double? IdleSeconds,
    double? Score,
    string Status,
    bool IsOnline)
{
    /// <summary>Not eligible, but every reason may be overridden by an operator with a reason.</summary>
    public bool Overridable => !Eligible && Reasons.Count > 0 && Reasons.All(DispatchReasons.IsOverridable);
}

/// <summary>FLT-01: what dispatch decided for a Job and on which evidence.</summary>
public sealed record DispatchDecisionRecord(
    Guid JobId,
    Guid? SelectedRobotId,
    string Trigger,
    Guid? ActorId,
    string? OverrideReason,
    IReadOnlyList<DispatchCandidate> Candidates);

public sealed record DispatchDecisionView(
    Guid Id,
    Guid JobId,
    Guid? SelectedRobotId,
    string Type,
    string Trigger,
    Guid? ActorId,
    string? OverrideReason,
    DateTimeOffset CreatedAt,
    IReadOnlyList<DispatchCandidate> Candidates);

public static class DispatchTriggers
{
    public const string Start = "START";
    public const string Resume = "RESUME";
}
