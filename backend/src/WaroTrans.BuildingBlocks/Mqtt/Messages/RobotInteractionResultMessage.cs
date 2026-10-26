namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

/// <summary>
/// Backend → robot: business acceptance of an interaction_confirm (not MQTT QoS ACK).
/// </summary>
public sealed class RobotInteractionResultMessage
{
    public int SchemaVersion { get; set; } = 1;
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public Guid JobStepId { get; set; }
    public Guid ConfirmMessageId { get; set; }
    public bool Accepted { get; set; }
    public string? ReasonCode { get; set; }
    public DateTimeOffset ProcessedAt { get; set; }
}
