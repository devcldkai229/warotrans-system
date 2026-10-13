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
}

public sealed record WarehouseSnapshot(Guid Id, string Code, bool IsActive);

public sealed record ContainerSnapshot(Guid Id, string Barcode, ContainerStatus Status);
