namespace WaroTrans.Fleet.Entities;

/// <summary>
/// FE-09: one stored point of a robot's movement history. Telemetry arrives several times a second; a point is kept
/// only when the robot moved or turned far enough, or has been moving for a while without one (RobotPoseSampling).
/// </summary>
public sealed class RobotPoseSample
{
    public Guid Id { get; set; }
    public Guid RobotId { get; set; }

    /// <summary>The Job the robot was assigned to then, if any.</summary>
    public Guid? JobId { get; set; }

    /// <summary>The command the robot reported it was running.</summary>
    public Guid? CommandId { get; set; }

    public double X { get; set; }
    public double Y { get; set; }
    public double Yaw { get; set; }
    public double? LinearVelocity { get; set; }
    public double? AngularVelocity { get; set; }

    /// <summary>The map the pose is on, as the robot reported it.</summary>
    public string? MapVersionCode { get; set; }

    /// <summary>When the backend received the telemetry (server clock).</summary>
    public DateTimeOffset RecordedAt { get; set; }
}
