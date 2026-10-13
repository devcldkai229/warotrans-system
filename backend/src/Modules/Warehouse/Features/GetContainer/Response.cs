namespace WaroTrans.Warehouse.Features.GetContainer;

public sealed record ContainerDetailsResponse(
    Guid Id,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    string Barcode,
    string? SupplierPackageBarcode,
    string Status,
    Guid? CurrentStorageLocationId,
    string? CurrentStorageLocationCode,
    string? CurrentStorageLocationName,
    short? CurrentLevelNo,
    Guid CreatedBy,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);
