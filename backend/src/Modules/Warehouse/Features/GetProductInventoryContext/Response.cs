namespace WaroTrans.Warehouse.Features.GetProductInventoryContext;

public sealed record LocationStockDto(
    Guid StorageLocationId,
    string StorageLocationCode,
    string StorageLocationName,
    short LevelNo,
    int ContainerCount
);

public sealed record ContainerSummaryDto(
    Guid Id,
    string Barcode,
    string Status,
    Guid? CurrentStorageLocationId,
    short? CurrentLevelNo,
    DateTimeOffset CreatedAt
);

public sealed record ProductInventoryContextResponse(
    Guid ProductId,
    string Sku,
    string ProductName,
    int TotalContainers,
    IReadOnlyDictionary<string, int> ContainersByStatus,
    IReadOnlyList<LocationStockDto> StorageLocations,
    IReadOnlyList<ContainerSummaryDto> RecentContainers
);
