namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// What the Active Mode robot executor can actually run (not merely classify).
/// Wired from <c>Traffic:Maneuvers</c>. Validator must not accept infeasible classes.
/// </summary>
public sealed class TrafficManeuverOptions
{
    public const string SectionName = "Traffic:Maneuvers";

    /// <summary>FollowPath along densified polylines (always required for Active).</summary>
    public bool ForwardEnabled { get; set; } = true;

    /// <summary>FollowPathReverse with allow_reversing on a dedicated controller_id.</summary>
    public bool ReverseEnabled { get; set; } = true;

    /// <summary>Nav2 Spin action under MotionAuthority (not BT recovery).</summary>
    public bool SpinEnabled { get; set; } = true;

    /// <summary>
    /// ContinuousArc as a separate executable kind. v10 keeps false — arcs must be Forward polylines
    /// on the grant or reclassified as Spin / INVALID.
    /// </summary>
    public bool ContinuousArcEnabled { get; set; } = false;

    public static TrafficManeuverOptions Default { get; } = new();
}

/// <summary>Executable segment step kinds carried on MotionAuthority / MQTT.</summary>
public enum TrafficManeuverKind
{
    Forward = 0,
    Reverse = 1,
    Spin = 2
}

/// <summary>One ordered step inside a granted segment.</summary>
public sealed record TrafficManeuverStep(
    TrafficManeuverKind Kind,
    IReadOnlyList<int> EdgeIds,
    double? YawTargetRad = null,
    IReadOnlyList<string>? ResourceIds = null);
