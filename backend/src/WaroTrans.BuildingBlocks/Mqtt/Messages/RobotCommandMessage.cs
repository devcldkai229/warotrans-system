using System.Text.Json;

namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed class RobotCommandMessage
{
    public int SchemaVersion { get; set; }
    public Guid MessageId { get; set; }
    public Guid CommandId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public DateTimeOffset IssuedAt { get; set; }
    public Guid? JobAssignmentId { get; set; }
    public Guid? JobStepId { get; set; }
    public JsonElement Payload { get; set; }
}

public static class RobotCommandTypes
{
    public const string NavigateToPose = "NAVIGATE_TO_POSE";
    public const string Cancel = "CANCEL";
}

public sealed class NavigateToPosePayload
{
    public string FrameId { get; set; } = "map";
    public double X { get; set; }
    public double Y { get; set; }
    public double Yaw { get; set; }
}

public sealed class CancelCommandPayload
{
    public Guid TargetCommandId { get; set; }
}
