namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed class RobotCommandAckMessage
{
    public int SchemaVersion { get; set; }
    public Guid MessageId { get; set; }
    public Guid CommandId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public bool Accepted { get; set; }
    public string? ReasonCode { get; set; }
    public DateTimeOffset SentAt { get; set; }
}
