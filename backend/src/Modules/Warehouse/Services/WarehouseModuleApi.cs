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
                c.CurrentLevelNo,
                c.WeightKg, c.WarehouseId, c.CreationRequestId.HasValue, c.InboundStockVoucherId))
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

    public async Task<IReadOnlyList<OutboundStockCandidate>> GetOutboundStockCandidatesAsync(
        Guid warehouseId,
        Guid productId,
        IReadOnlyCollection<Guid> shelfEndpointIds,
        IReadOnlyCollection<Guid> unavailableContainerIds,
        int take,
        CancellationToken cancellationToken = default)
    {
        // An old recorded shelf receipt is the fallback for legacy goods. Barcode creation time is not a receipt.
        var candidates = from box in dbContext.Containers.AsNoTracking()
                         let shelf = box.CurrentStorageLocation
                         let level = box.CurrentLevelNo ?? (short)1
                         where box.ProductId == productId && box.Product!.IsActive
                             && box.Status == ContainerStatus.STORED && box.CurrentEndpointId == null
                             && (box.WarehouseId == null || box.WarehouseId == warehouseId)
                             && (box.CreationRequestId == null || box.InboundStockVoucherId != null)
                             && shelf != null && shelf.WarehouseId == warehouseId && shelf.IsActive
                             && shelfEndpointIds.Contains(shelf.EndpointId)
                             && !unavailableContainerIds.Contains(box.Id)
                             // Only goods a CONFIRMED phiếu xuất has reserved go to an Outbound gate.
                             && dbContext.StockVoucherLines.Any(l => l.ContainerId == box.Id && l.ClosedShortAt == null
                                 && l.StockVoucher.Type == StockVoucherType.OUTBOUND
                                 && l.StockVoucher.Status == StockVoucherStatus.CONFIRMED
                                 && l.StockVoucher.WarehouseId == warehouseId)
                             && dbContext.InventoryStocks.Any(stock => stock.ProductId == box.ProductId
                                 && stock.StorageLocationId == shelf.Id && stock.LevelNo == level && stock.ContainerCount > 0)
                         let admitted = dbContext.StockVouchers
                             .Where(v => v.Id == box.InboundStockVoucherId && v.WarehouseId == warehouseId
                                 && v.Type == StockVoucherType.INBOUND
                                 && (v.Status == StockVoucherStatus.CONFIRMED || v.Status == StockVoucherStatus.COMPLETED))
                             .Select(v => v.StockPostedAt).FirstOrDefault()
                             ?? dbContext.ContainerMovements.Where(m => m.ContainerId == box.Id
                                 && m.ToStatus == ContainerStatus.STORED
                                 && dbContext.StorageLocations.Any(location => location.Id == m.ToStorageLocationId && location.WarehouseId == warehouseId)
                                 && (m.Type == ContainerMovementType.DELIVERED || m.Type == ContainerMovementType.RECOVERED))
                                 .Min(m => (DateTimeOffset?)m.OccurredAt)
                         where admitted != null
                         orderby admitted, box.Barcode, box.Id
                         select new OutboundStockCandidate(box.Id, box.Barcode, shelf.Id, shelf.Code, shelf.EndpointId, level, admitted!.Value);
        return await candidates.Take(take).ToListAsync(cancellationToken);
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
            .Where(l => containerIds.Contains(l.ContainerId) && l.StockVoucher.Status == StockVoucherStatus.CONFIRMED && l.ClosedShortAt == null)
            .Select(l => new ContainerVoucherSnapshot(
                l.ContainerId,
                l.StockVoucherId,
                l.StockVoucher.Code,
                l.StockVoucher.Type,
                l.StockVoucher.WarehouseId))
            .ToListAsync(cancellationToken);
    }
}
