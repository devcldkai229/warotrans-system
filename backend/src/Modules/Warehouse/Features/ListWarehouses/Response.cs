namespace WaroTrans.Warehouse.Features.ListWarehouses;

public sealed record WarehouseListItemResponse(
    Guid Id,
    string Code,
    string Name,
    bool IsActive,
    DateTimeOffset CreatedAt);

public sealed record ListWarehousesResponse(
    IReadOnlyList<WarehouseListItemResponse> Items,
    int Total);
