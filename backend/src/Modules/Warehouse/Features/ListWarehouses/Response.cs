namespace WaroTrans.Warehouse.Features.ListWarehouses;

public sealed record WarehouseListItemResponse(
    Guid Id,
    string Code,
    string Name,
    string? Address,
    string Timezone,
    bool IsActive,
    DateTimeOffset CreatedAt);

public sealed record ListWarehousesResponse(
    IReadOnlyList<WarehouseListItemResponse> Items,
    int Total);
