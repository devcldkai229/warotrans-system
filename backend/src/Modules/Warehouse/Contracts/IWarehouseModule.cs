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

    /// <summary>The active StorageLocations of the Warehouse that sit on these Endpoints (one per Endpoint at most).</summary>
    Task<IReadOnlyList<StorageLocationSnapshot>> GetStorageLocationsByEndpointsAsync(
        Guid warehouseId,
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default);

    /// <summary>Returns the oldest eligible stocked Containers at the supplied shelf endpoints.</summary>
    Task<IReadOnlyList<OutboundStockCandidate>> GetOutboundStockCandidatesAsync(
        Guid warehouseId,
        Guid productId,
        IReadOnlyCollection<Guid> shelfEndpointIds,
        IReadOnlyCollection<Guid> unavailableContainerIds,
        int take,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<OutboundStockCandidate>>([]);

    /// <summary>The CONFIRMED StockVoucher lines that hold these Containers (a Container may be on one of each type).</summary>
    Task<IReadOnlyList<ContainerVoucherSnapshot>> GetConfirmedVoucherLinesAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default);
}

public sealed record WarehouseSnapshot(Guid Id, string Code, bool IsActive);

public sealed record ContainerSnapshot(
    Guid Id,
    string Barcode,
    ContainerStatus Status,
    Guid? CurrentStorageLocationId,
    short? CurrentLevelNo,
    decimal? WeightKg = null,
    Guid? WarehouseId = null,
    bool RequiresInboundAdmission = false,
    Guid? InboundStockVoucherId = null);

public sealed record StorageLocationSnapshot(
    Guid Id,
    Guid WarehouseId,
    Guid EndpointId,
    string Code,
    string Name,
    bool IsActive);

public sealed record ContainerVoucherSnapshot(
    Guid ContainerId,
    Guid StockVoucherId,
    string StockVoucherCode,
    StockVoucherType Type,
    Guid WarehouseId);


public sealed record OutboundStockCandidate(
    Guid ContainerId,
    string Barcode,
    Guid SourceStorageLocationId,
    string SourceStorageLocationCode,
    Guid SourceEndpointId,
    short SourceLevelNo,
    DateTimeOffset AdmittedAt);
