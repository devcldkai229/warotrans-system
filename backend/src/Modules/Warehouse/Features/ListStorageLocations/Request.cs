namespace WaroTrans.Warehouse.Features.ListStorageLocations;

public sealed record ListStorageLocationsRequest(
    Guid WarehouseId,
    bool ActiveOnly);
