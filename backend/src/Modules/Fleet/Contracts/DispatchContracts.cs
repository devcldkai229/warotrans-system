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
    public const string PayloadExceeded = "robot_payload_exceeded";
    public const string ContainerLimitExceeded = "robot_container_limit_exceeded";
    public const string LargerThanTrafficFootprint = "robot_larger_than_traffic_footprint";

    /// <summary>Not a reason to refuse: the figures were missing, so the load could not be checked.</summary>
    public const string CapacityUnknown = "capacity_unknown";

    public static bool IsCapacity(string reason) => reason is PayloadExceeded or ContainerLimitExceeded or LargerThanTrafficFootprint;

    /// <summary>
    /// The only reasons an operator override (dispatch.override + a reason) may skip: the battery is not known to be
    /// low, only not known. Safety, maintenance, manual mode and a low battery are never overridable.
    /// </summary>
    public static bool IsOverridable(string reason) => reason is BatteryUnknown or BatteryStale;
}

/// <summary>Where the work starts (the pickup endpoint), for the distance score. Null = score without distance.</summary>
public sealed record DispatchQuery(Guid MapVersionId, double? PickupX, double? PickupY, IReadOnlySet<Guid> BusyRobotIds)
{
    /// <summary>FL-03: what the Job carries. Null weight = at least one Container has none on record.</summary>
    public int? ContainerCount { get; init; }
    public decimal? TotalWeightKg { get; init; }
}

/// <summary>FL-03: the most any robot in service on a map can carry. Null when a robot has not declared it: nothing can be concluded then.</summary>
public sealed record FleetCapacity(int? LargestMaxContainers, decimal? LargestPayloadKg);

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
    /// <summary>Things worth knowing that did not refuse the robot (capacity_unknown).</summary>
    public IReadOnlyList<string> Notes { get; init; } = [];

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
    IReadOnlyList<DispatchCandidate> Candidates)
{
    /// <summary>Set when <see cref="SelectedRobotId"/> was named but refused; that robot was not assigned.</summary>
    public string? RefusalCode { get; init; }
}

public sealed record DispatchDecisionView(
    Guid Id,
    Guid JobId,
    Guid? SelectedRobotId,
    string Type,
    string Trigger,
    Guid? ActorId,
    string? OverrideReason,
    DateTimeOffset CreatedAt,
    IReadOnlyList<DispatchCandidate> Candidates,
    string? RefusalCode = null);

public static class DispatchTriggers
{
    public const string Start = "START";
    public const string Resume = "RESUME";
}
