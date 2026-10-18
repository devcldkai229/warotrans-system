namespace WaroTrans.Warehouse.Features.ListInventory;

/// <param name="ContainerCount">Number of Containers, not product units (V1).</param>
public sealed record InventoryStockItemResponse(
    Guid Id,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    Guid StorageLocationId,
    string StorageLocationCode,
    string StorageLocationName,
    short LevelNo,
    int ContainerCount,
    DateTimeOffset UpdatedAt);

public sealed record ListInventoryResponse(IReadOnlyList<InventoryStockItemResponse> Items, int Total);
