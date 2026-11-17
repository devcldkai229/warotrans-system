using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.Shared;

/// <summary>Balances in boxes, not contents units. Callers lock stock products before changing balances.</summary>
internal static class InventoryAccounting
{
    public static async Task AdjustAsync(WarehouseDbContext db, Guid productId, Guid locationId, short level, int delta, DateTimeOffset now, CancellationToken ct)
    {
        var stock = db.InventoryStocks.Local.FirstOrDefault(s => s.ProductId == productId && s.StorageLocationId == locationId && s.LevelNo == level)
            ?? await db.InventoryStocks.SingleOrDefaultAsync(s => s.ProductId == productId && s.StorageLocationId == locationId && s.LevelNo == level, ct);
        if (stock is null)
        {
            if (delta < 0) throw new ConflictException("The recorded inventory balance is missing; reconcile stock before moving goods.", "inventory_balance_missing");
            db.InventoryStocks.Add(new InventoryStock { Id = Guid.NewGuid(), ProductId = productId, StorageLocationId = locationId, LevelNo = level, ContainerCount = delta, UpdatedAt = now });
            return;
        }
        if (db.Entry(stock).State == EntityState.Deleted) db.Entry(stock).State = EntityState.Modified;
        var count = checked(stock.ContainerCount + delta);
        if (count < 0) throw new ConflictException("The recorded inventory balance would be negative; reconcile stock first.", "inventory_balance_insufficient");
        stock.ContainerCount = count;
        stock.UpdatedAt = now;
        if (count == 0) db.InventoryStocks.Remove(stock);
    }

    public static async Task TransferAsync(WarehouseDbContext db, Container container, Guid target, short level, DateTimeOffset now, CancellationToken ct)
    {
        if (container.InboundStockVoucherId is null || container.InventoryStorageLocationId is not { } source || container.InventoryLevelNo is not { } sourceLevel)
            throw new ConflictException("The Container has no complete inbound stock receipt.", "container_stock_receipt_invalid");
        var locations = await db.StorageLocations.AsNoTracking().Where(l => l.Id == source || l.Id == target).ToListAsync(ct);
        var from = locations.SingleOrDefault(l => l.Id == source);
        var to = locations.SingleOrDefault(l => l.Id == target);
        if (from is null || to is null || !to.IsActive || from.WarehouseId != to.WarehouseId || level < 1)
            throw new ConflictException("A stock transfer must stay within the warehouse and use an active location.", "inventory_transfer_location_invalid");
        if (source != target || sourceLevel != level)
        {
            await AdjustAsync(db, container.ProductId, source, sourceLevel, -1, now, ct);
            await AdjustAsync(db, container.ProductId, target, level, 1, now, ct);
        }
        container.InventoryStorageLocationId = target;
        container.InventoryLevelNo = level;
    }
}
