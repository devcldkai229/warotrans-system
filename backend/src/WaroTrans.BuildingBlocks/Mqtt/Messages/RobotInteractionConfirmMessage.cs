namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

/// <summary>
/// Robot → backend: physical button confirmation for one armed HUMAN_INTERACTION JobStep.
/// </summary>
public sealed class RobotInteractionConfirmMessage
{
    public int SchemaVersion { get; set; }
    public Guid MessageId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public Guid BootId { get; set; }
    public long Sequence { get; set; }
    public DateTimeOffset SentAt { get; set; }
    public Guid JobId { get; set; }
    public Guid JobStepId { get; set; }
    public string InteractionType { get; set; } = string.Empty;
    public Guid ContainerId { get; set; }
    public Guid EndpointId { get; set; }
    public string Source { get; set; } = "ROBOT_BUTTON";
}
