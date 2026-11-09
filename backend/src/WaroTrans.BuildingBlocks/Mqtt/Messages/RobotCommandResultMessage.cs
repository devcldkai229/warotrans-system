namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

public sealed class RobotCommandResultMessage
{
    public int SchemaVersion { get; set; }
    public Guid MessageId { get; set; }
    public Guid CommandId { get; set; }
    public string RobotCode { get; set; } = string.Empty;
    public string Outcome { get; set; } = string.Empty;
    public string? ErrorCode { get; set; }
    /// <summary>Robot-side detail: nav2ErrorCode, arrivalErrorXyM, arrivalErrorYawRad (settled pose vs the goal).</summary>
    public System.Text.Json.JsonElement? Result { get; set; }
    public DateTimeOffset SentAt { get; set; }
}

public static class RobotCommandOutcomes
{
    public const string Succeeded = "SUCCEEDED";
    public const string Failed = "FAILED";
    public const string Canceled = "CANCELED";
}
