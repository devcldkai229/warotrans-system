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
    public string NavigationStatus { get; set; } = string.Empty;
    public string LocalizationStatus { get; set; } = string.Empty;
    public double LinearVelocity { get; set; }
    public double AngularVelocity { get; set; }
    public Guid? CurrentCommandId { get; set; }
    public string? ErrorCode { get; set; }
}
