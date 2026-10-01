namespace WaroTrans.Warehouse.Entities;

public sealed class InventoryStock
{
    public Guid Id { get; set; }
    public Guid ProductId { get; set; }
    public Guid StorageLocationId { get; set; }
    public short LevelNo { get; set; }
    public int ContainerCount { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
