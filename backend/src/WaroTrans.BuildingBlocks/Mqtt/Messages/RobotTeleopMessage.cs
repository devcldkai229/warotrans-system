namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

/// <summary>
/// Manual drive setpoint (backend → robot, topic <c>…/robots/{code}/teleop</c>, QoS 0, no ACK/RESULT).
/// Sent repeatedly while the operator holds a direction; <c>{0, 0}</c> stops. The robot clamps the speeds
/// and stops on its own when messages stop arriving (deadman).
/// </summary>
public sealed class RobotTeleopMessage
{
    public int SchemaVersion { get; set; } = 1;
    public string RobotCode { get; set; } = string.Empty;

    /// <summary>Forward speed in m/s (REP-103: +x forward, negative = reverse).</summary>
    public double Linear { get; set; }

    /// <summary>Turn rate in rad/s (+ = counter-clockwise / left).</summary>
    public double Angular { get; set; }

    /// <summary>Drive Assist: the robot scales the speed down and stops before an obstacle ahead (lidar).</summary>
    public bool Assist { get; set; } = true;

    public DateTimeOffset SentAt { get; set; }
}
