namespace WaroTrans.Warehouse.Entities;

public sealed class Warehouse
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Address { get; set; }
    public string Timezone { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
