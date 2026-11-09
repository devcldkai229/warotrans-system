namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

/// <summary>
/// Robot → backend, topic <c>robots/{code}/health</c>, every few seconds (RB-10). One item per checked part
/// (lidar, odometry, imu, ultrasonic, tf_localization, nav2, esp32_link, cpu, temperature, memory …).
/// A value the robot cannot measure is sent as null with level UNKNOWN, never invented.
/// </summary>
public sealed class RobotHealthMessage
{
    public int SchemaVersion { get; set; } = 1;
    public string RobotCode { get; set; } = string.Empty;
    public DateTimeOffset SentAt { get; set; }
    public List<RobotHealthItem> Items { get; set; } = [];
}

public sealed class RobotHealthItem
{
    public const string Ok = "OK";
    public const string Warn = "WARN";
    public const string Error = "ERROR";
    public const string Stale = "STALE";
    public const string Unknown = "UNKNOWN";

    public string Name { get; set; } = string.Empty;

    /// <summary>OK, WARN, ERROR, STALE (the source stopped updating) or UNKNOWN (not measured).</summary>
    public string Level { get; set; } = Unknown;

    public double? Value { get; set; }
    public string? Unit { get; set; }
    public string? Message { get; set; }
    public DateTimeOffset? MeasuredAt { get; set; }
}
