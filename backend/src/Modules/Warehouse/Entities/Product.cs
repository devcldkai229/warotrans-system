namespace WaroTrans.Warehouse.Entities;

public sealed class Product
{
    public Guid Id { get; set; }
    public Guid CategoryId { get; set; }
    public string Sku { get; set; } = string.Empty;
    public string? SupplierBarcode { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
