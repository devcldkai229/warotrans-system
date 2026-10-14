namespace WaroTrans.Warehouse.Features.ListStorageLocations;

public sealed record StorageLocationListItemResponse(
    Guid Id,
    Guid WarehouseId,
    Guid EndpointId,
    string Code,
    string Name,
    bool IsActive);

public sealed record ListStorageLocationsResponse(
    IReadOnlyList<StorageLocationListItemResponse> Items,
    int Total);
