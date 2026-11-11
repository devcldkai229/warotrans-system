namespace WaroTrans.Transportation.Entities;

/// <summary>
/// A handover Warehouse still has to post (WH-01). Written in the same transaction as the Detail, so a stock update that
/// fails is retried instead of lost. <see cref="Key"/> is unique: a repeated handover event queues nothing new.
/// </summary>
public sealed class StockPosting
{
    public Guid Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public StockPostingType Type { get; set; }
    public Guid ContainerId { get; set; }
    public Guid JobId { get; set; }
    public Guid TransportRequestId { get; set; }
    public Guid? DestinationStorageLocationId { get; set; }
    public short? DestinationLevelNo { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? NextAttemptAt { get; set; }
    public DateTimeOffset? PostedAt { get; set; }
    public string? LastError { get; set; }
}

public enum StockPostingType
{
    PICKUP,
    DELIVERY
}
