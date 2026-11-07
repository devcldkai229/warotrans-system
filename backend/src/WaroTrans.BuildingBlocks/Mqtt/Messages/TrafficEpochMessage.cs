namespace WaroTrans.BuildingBlocks.Mqtt.Messages;

/// <summary>
/// Retained on <c>{prefix}/traffic/epoch</c>. A robot drops every grant of an older epoch the moment it sees a newer
/// one: after a backend restart the old coordinator's reservations no longer exist.
/// </summary>
public sealed class TrafficEpochMessage
{
    public int SchemaVersion { get; set; } = 1;
    public long Epoch { get; set; }
    public Guid CoordinatorId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
}
