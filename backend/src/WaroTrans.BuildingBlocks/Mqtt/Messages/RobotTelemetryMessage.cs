namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed class RobotTelemetryMessage
{
    public int SchemaVersion { get; set; }
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public Guid BootId { get; set; }
    public long Sequence { get; set; }
    public DateTimeOffset SentAt { get; set; }
    public string? MapVersionCode { get; set; }
    public RobotPoseMessage? Pose { get; set; }
    /// <summary>0..100; null = unknown (no battery measurement), never 0.</summary>
    public decimal? BatteryPercent { get; set; }
    /// <summary>Filtered pack voltage (V), optional.</summary>
    public decimal? BatteryVoltage { get; set; }
    /// <summary>VOLTAGE_ONLY | SIMULATED | UNAVAILABLE, optional (absent = older gateway).</summary>
    public string? BatteryEstimationMode { get; set; }
    /// <summary>MEDIUM | LOW | NONE, optional.</summary>
    public string? BatteryConfidence { get; set; }
    /// <summary>UNKNOWN | CHARGING | NOT_CHARGING, optional.</summary>
    public string? BatteryChargingState { get; set; }
    /// <summary>When the robot last received a battery estimate, optional.</summary>
    public DateTimeOffset? BatteryMeasuredAt { get; set; }
    public string NavigationStatus { get; set; } = string.Empty;
    public string LocalizationStatus { get; set; } = string.Empty;
    public double LinearVelocity { get; set; }
    public double AngularVelocity { get; set; }
    public Guid? CurrentCommandId { get; set; }
    public string? ErrorCode { get; set; }
}
