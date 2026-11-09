using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Services;

public sealed class WarehouseModuleApi(WarehouseDbContext dbContext) : IWarehouseModule
{
    public Task<WarehouseSnapshot?> GetWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken = default) =>
        dbContext.Warehouses
            .AsNoTracking()
            .Where(w => w.Id == warehouseId)
            .Select(w => new WarehouseSnapshot(w.Id, w.Code, w.IsActive))
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<ContainerSnapshot>> GetContainersAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default)
    {
        if (containerIds.Count == 0)
        {
            return [];
        }

        return await dbContext.Containers
            .AsNoTracking()
            .Where(c => containerIds.Contains(c.Id))
            .Select(c => new ContainerSnapshot(
                c.Id,
                c.Barcode,
                c.Status,
                c.CurrentStorageLocationId,
                c.CurrentLevelNo))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<StorageLocationSnapshot>> GetStorageLocationsAsync(
        IReadOnlyCollection<Guid> storageLocationIds,
        CancellationToken cancellationToken = default)
    {
        if (storageLocationIds.Count == 0)
        {
            return [];
        }

        return await dbContext.StorageLocations
            .AsNoTracking()
            .Where(s => storageLocationIds.Contains(s.Id))
            .Select(s => new StorageLocationSnapshot(
                s.Id,
                s.WarehouseId,
                s.EndpointId,
                s.Code,
                s.Name,
                s.IsActive))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<StorageLocationSnapshot>> GetStorageLocationsByEndpointsAsync(
        Guid warehouseId,
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default)
    {
        if (endpointIds.Count == 0)
        {
            return [];
        }

        return await dbContext.StorageLocations
            .AsNoTracking()
            .Where(s => s.WarehouseId == warehouseId && s.IsActive && endpointIds.Contains(s.EndpointId))
            .Select(s => new StorageLocationSnapshot(
                s.Id,
                s.WarehouseId,
                s.EndpointId,
                s.Code,
                s.Name,
                s.IsActive))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ContainerVoucherSnapshot>> GetConfirmedVoucherLinesAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default)
    {
        if (containerIds.Count == 0)
        {
            return [];
        }

        return await dbContext.StockVoucherLines
            .AsNoTracking()
            .Where(l => containerIds.Contains(l.ContainerId) && l.StockVoucher.Status == StockVoucherStatus.CONFIRMED)
            .Select(l => new ContainerVoucherSnapshot(
                l.ContainerId,
                l.StockVoucherId,
                l.StockVoucher.Code,
                l.StockVoucher.Type,
                l.StockVoucher.WarehouseId))
            .ToListAsync(cancellationToken);
    }
}
