namespace WaroTrans.Warehouse.Features.CreateContainer;

public sealed record CreateContainerResponse(
    Guid Id,
    Guid ProductId,
    string Barcode,
    string? SupplierPackageBarcode,
    string Status,
    Guid? CurrentStorageLocationId,
    short? CurrentLevelNo,
    Guid CreatedBy,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt
);
