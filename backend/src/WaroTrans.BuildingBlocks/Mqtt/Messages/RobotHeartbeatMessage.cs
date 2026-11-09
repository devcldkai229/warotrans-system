namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed class RobotHeartbeatMessage
{
    public int SchemaVersion { get; set; }
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public Guid BootId { get; set; }
    public long Sequence { get; set; }
    public DateTimeOffset SentAt { get; set; }

    /// <summary>System actions this robot can perform (RB-09), e.g. RESTART_STACK, REBOOT, SHUTDOWN. Null on older robots.</summary>
    public List<string>? Capabilities { get; set; }
}
