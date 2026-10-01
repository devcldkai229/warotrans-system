namespace WaroTrans.Warehouse.Entities;

public sealed class StorageLocation
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid EndpointId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
