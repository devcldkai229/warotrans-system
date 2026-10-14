namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed record ContainerListItemResponse(
    Guid Id,
    string Barcode,
    string Status,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    Guid? CurrentStorageLocationId,
    string? CurrentStorageLocationCode,
    Guid? CurrentEndpointId,
    short? CurrentLevelNo);

public sealed record ListContainersResponse(
    IReadOnlyList<ContainerListItemResponse> Items,
    int Total);
