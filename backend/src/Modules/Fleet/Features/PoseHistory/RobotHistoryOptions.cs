namespace WaroTrans.Fleet.Features.PoseHistory;

/// <summary>
/// <c>Fleet:History</c>: how long robot history is kept and when a telemetry pose becomes a movement history point.
/// </summary>
public sealed class RobotHistoryOptions
{
    public const string SectionName = "Fleet:History";

    /// <summary>State changes (robot_state_events) are kept this long.</summary>
    public int RetentionDays { get; set; } = 90;

    /// <summary>Movement history points (robot_pose_samples) are kept this long: they are many more.</summary>
    public int PoseRetentionDays { get; set; } = 7;

    /// <summary>A point is kept once the robot is this far from the last one.</summary>
    public double MinDistanceMeters { get; set; } = 0.25;

    /// <summary>… or has turned this much (20°).</summary>
    public double MinHeadingChangeRad { get; set; } = 0.35;

    /// <summary>… or has been moving this long without a point.</summary>
    public double MaxIntervalSeconds { get; set; } = 10;

    /// <summary>How often old history is deleted.</summary>
    public int RetentionSweepMinutes { get; set; } = 360;
}
