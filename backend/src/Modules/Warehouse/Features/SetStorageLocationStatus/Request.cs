namespace WaroTrans.Warehouse.Features.SetStorageLocationStatus;

/// <summary>A location that still holds Containers cannot be deactivated.</summary>
public sealed record SetStorageLocationStatusRequest(bool IsActive);
