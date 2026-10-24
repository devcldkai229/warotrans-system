namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

/// <summary>
/// Backend → robot: arm the physical confirm button for one waiting HUMAN_INTERACTION JobStep.
/// Not a RobotCommand.
/// </summary>
public sealed class RobotInteractionRequestMessage
{
    public int SchemaVersion { get; set; } = 1;
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public Guid JobId { get; set; }
    public Guid JobStepId { get; set; }
    public string InteractionType { get; set; } = string.Empty;
    public Guid ContainerId { get; set; }
    public Guid EndpointId { get; set; }
    public DateTimeOffset SentAt { get; set; }
}
