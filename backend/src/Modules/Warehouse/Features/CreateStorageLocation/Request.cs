namespace WaroTrans.Warehouse.Features.CreateStorageLocation;

/// <summary>
/// Admin create for warehouse.storage_locations. Code is unique per warehouse (trimmed, upper-cased). The Endpoint
/// must be enabled and on the warehouse's PUBLISHED map, and serves this location only. The location starts active.
/// </summary>
public sealed record CreateStorageLocationRequest(Guid WarehouseId, Guid EndpointId, string Code, string Name);
