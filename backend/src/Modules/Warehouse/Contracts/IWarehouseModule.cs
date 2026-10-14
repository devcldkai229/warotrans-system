using WaroTrans.Warehouse.Enums;

namespace WaroTrans.Warehouse.Contracts;

/// <summary>
/// Read-only public contract for other modules. Returns snapshots, never Warehouse entities.
/// </summary>
public interface IWarehouseModule
{
    Task<WarehouseSnapshot?> GetWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ContainerSnapshot>> GetContainersAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<StorageLocationSnapshot>> GetStorageLocationsAsync(
        IReadOnlyCollection<Guid> storageLocationIds,
        CancellationToken cancellationToken = default);
}

public sealed record WarehouseSnapshot(Guid Id, string Code, bool IsActive);

public sealed record ContainerSnapshot(
    Guid Id,
    string Barcode,
    ContainerStatus Status,
    Guid? CurrentStorageLocationId,
    short? CurrentLevelNo);

public sealed record StorageLocationSnapshot(
    Guid Id,
    Guid WarehouseId,
    Guid EndpointId,
    string Code,
    string Name,
    bool IsActive);
