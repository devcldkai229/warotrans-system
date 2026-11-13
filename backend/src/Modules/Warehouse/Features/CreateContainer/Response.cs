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

/// <summary>Stable creation identities and group/ordinal mapping. Current location/status may change after transport.</summary>
public sealed record CreateContainerBatchResponse(
    Guid RequestId,
    Guid WarehouseId,
    int ContainerCount,
    bool Replayed,
    IReadOnlyList<CreatedContainerBatchItem> Items);

public sealed record CreatedContainerBatchItem(
    Guid Id,
    string Barcode,
    Guid ProductId,
    string GroupKey,
    int ContainerNo,
    decimal ContentsQuantity,
    string ContentsUnit,
    string? SupplierPackageBarcode,
    string Status,
    Guid? CurrentStorageLocationId,
    Guid? CurrentEndpointId,
    DateTimeOffset CreatedAt);
