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
    public decimal? BatteryPercent { get; set; }

    /// <summary>HW-04: pack voltage behind the estimate (null without a sensor).</summary>
    public double? BatteryVoltage { get; set; }

    /// <summary>HW-04: VOLTAGE_ONLY, SIMULATED or UNAVAILABLE.</summary>
    public string? BatteryEstimationMode { get; set; }

    /// <summary>HW-04: confidence of a VOLTAGE_ONLY estimate (e.g. HIGH, MEDIUM, LOW, NONE).</summary>
    public string? BatteryConfidence { get; set; }

    /// <summary>HW-04: CHARGING, DISCHARGING or UNKNOWN (charging is never inferred from voltage alone).</summary>
    public string? BatteryChargingState { get; set; }
    public string NavigationStatus { get; set; } = string.Empty;
    public string LocalizationStatus { get; set; } = string.Empty;
    public double LinearVelocity { get; set; }
    public double AngularVelocity { get; set; }
    public Guid? CurrentCommandId { get; set; }
    public string? ErrorCode { get; set; }

    /// <summary>True while the robot holds all motion after STOP/PAUSE (RB-03). Null from robots that predate it.</summary>
    public bool? MotionHold { get; set; }
}
