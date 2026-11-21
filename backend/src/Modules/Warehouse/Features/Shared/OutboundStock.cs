using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.Shared;

/// <summary>
/// A Container a phiếu xuất may name: on a shelf of the voucher's warehouse, with booked stock where it is counted.
/// The stock comes off that slot when a robot delivers the Container to an Outbound gate.
/// </summary>
internal static class OutboundStock
{
    public static async Task EnsureEligibleAsync(
        WarehouseDbContext db,
        Guid warehouseId,
        IReadOnlyCollection<Container> containers,
        CancellationToken ct)
    {
        var shelfIds = containers
            .SelectMany(c => new[] { c.CurrentStorageLocationId, c.InventoryStorageLocationId })
            .OfType<Guid>()
            .Distinct()
            .ToArray();
        var shelves = await db.StorageLocations.AsNoTracking()
            .Where(l => shelfIds.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, ct);
        var productIds = containers.Select(c => c.ProductId).Distinct().ToArray();
        var stock = await db.InventoryStocks.AsNoTracking()
            .Where(s => productIds.Contains(s.ProductId) && shelfIds.Contains(s.StorageLocationId) && s.ContainerCount > 0)
            .Select(s => new { s.ProductId, s.StorageLocationId, s.LevelNo })
            .ToListAsync(ct);

        foreach (var box in containers)
        {
            if (box.Status != ContainerStatus.STORED || box.CurrentStorageLocationId is not { } shelfId
                || !shelves.TryGetValue(shelfId, out var shelf) || shelf.WarehouseId != warehouseId
                || (box.WarehouseId.HasValue && box.WarehouseId != warehouseId))
            {
                throw new DomainValidationException(
                    $"Container '{box.Barcode}' must be on a shelf of this warehouse.",
                    "voucher_container_not_on_shelf");
            }

            if (box.CreationRequestId is not null && box.InboundStockVoucherId is null)
            {
                throw new DomainValidationException(
                    $"Container '{box.Barcode}' was never admitted by an inbound voucher.",
                    "inbound_voucher_required");
            }

            var slot = box.InventoryStorageLocationId ?? shelfId;
            var level = box.InventoryStorageLocationId.HasValue ? box.InventoryLevelNo ?? 1 : box.CurrentLevelNo ?? 1;
            if (!stock.Any(s => s.ProductId == box.ProductId && s.StorageLocationId == slot && s.LevelNo == level))
            {
                throw new ConflictException(
                    $"Container '{box.Barcode}' has no booked stock on its shelf; reconcile stock first.",
                    "inventory_balance_missing");
            }
        }
    }
}
