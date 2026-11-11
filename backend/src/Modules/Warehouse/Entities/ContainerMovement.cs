using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Entities;

/// <summary>
/// One line of the movement ledger (WH-01), written in the same transaction as the Container and InventoryStock change.
/// <see cref="IdempotencyKey"/> is unique, so a retried handover event cannot post twice. JobId and TransportRequestId
/// are scalars: those rows live in other modules.
/// </summary>
public sealed class ContainerMovement
{
    public Guid Id { get; set; }
    public Guid ContainerId { get; set; }
    public ContainerMovementType Type { get; set; }
    public ContainerStatus FromStatus { get; set; }
    public ContainerStatus ToStatus { get; set; }
    public Guid? FromStorageLocationId { get; set; }
    public short? FromLevelNo { get; set; }
    public Guid? ToStorageLocationId { get; set; }
    public short? ToLevelNo { get; set; }
    public Guid? JobId { get; set; }
    public Guid? TransportRequestId { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public Guid? ActorAccountId { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
}
