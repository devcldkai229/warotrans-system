namespace WaroTrans.Warehouse.Features.CreateWarehouse;

/// <summary>
/// Admin create for warehouse.warehouses. Code is unique (case-insensitive after trim/upper).
/// </summary>
public sealed record CreateWarehouseRequest(
    string Code,
    string Name,
    string? Timezone = null,
    string? Address = null,
    bool? IsActive = null);
