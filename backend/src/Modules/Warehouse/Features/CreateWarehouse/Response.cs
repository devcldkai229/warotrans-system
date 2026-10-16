namespace WaroTrans.Warehouse.Features.CreateWarehouse;

public sealed record CreateWarehouseResponse(
    Guid Id,
    string Code,
    string Name,
    string? Address,
    string Timezone,
    bool IsActive,
    DateTimeOffset CreatedAt);
