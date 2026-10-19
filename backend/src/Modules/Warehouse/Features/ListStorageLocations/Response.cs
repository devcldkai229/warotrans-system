using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;

namespace WaroTrans.Warehouse.Features.ListStorageLocations;

/// <param name="EndpointCode">Null when the Endpoint is unknown to Navigation (e.g. its map was removed).</param>
public sealed record StorageLocationListItemResponse(
    Guid Id,
    Guid WarehouseId,
    Guid EndpointId,
    string Code,
    string Name,
    bool IsActive,
    string WarehouseName,
    string? EndpointCode,
    string? EndpointName,
    string? EndpointType,
    DateTimeOffset CreatedAt)
{
    public static StorageLocationListItemResponse From(StorageLocation location, string warehouseName, MapEndpointSnapshot? endpoint) =>
        new(
            location.Id,
            location.WarehouseId,
            location.EndpointId,
            location.Code,
            location.Name,
            location.IsActive,
            warehouseName,
            endpoint?.Code,
            endpoint?.Name,
            endpoint?.EndpointType,
            location.CreatedAt);
}

public sealed record ListStorageLocationsResponse(
    IReadOnlyList<StorageLocationListItemResponse> Items,
    int Total);
