using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Services;

/// <summary>
/// Applies a delivered move to the Container and InventoryStock (counts are Containers, rules/00):
/// leaving a shelf takes 1 off that shelf level (the row goes when it reaches 0); landing on a shelf adds 1 and makes
/// the Container STORED;
/// landing off-shelf on a CONFIRMED outbound voucher makes it ISSUED. Any other off-shelf drop changes nothing.
/// </summary>
public sealed class ContainerMovementRecorder(
    WarehouseDbContext dbContext,
    ILogger<ContainerMovementRecorder> logger) : IContainerMovementRecorder
{
    private const int MaxAttempts = 3;

    public async Task RecordDeliveredAsync(ContainerDelivery delivery, CancellationToken cancellationToken = default)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await ApplyAsync(delivery, cancellationToken);
                return;
            }
            catch (DbUpdateException exception) when (attempt < MaxAttempts && IsRetryable(exception))
            {
                // Another delivery changed the same Container or stock row first: reload and apply again.
                dbContext.ChangeTracker.Clear();
            }
        }
    }

    private async Task ApplyAsync(ContainerDelivery delivery, CancellationToken cancellationToken)
    {
        var container = await dbContext.Containers.FirstOrDefaultAsync(c => c.Id == delivery.ContainerId, cancellationToken);
        if (container is null)
        {
            logger.LogWarning("Delivered Container {ContainerId} does not exist in Warehouse", delivery.ContainerId);
            return;
        }

        var destination = delivery.DestinationStorageLocationId;
        var level = delivery.DestinationLevelNo ?? 1;
        var alreadyApplied = container.Status == ContainerStatus.ISSUED
            || (destination.HasValue
                && container.Status == ContainerStatus.STORED
                && container.CurrentStorageLocationId == destination
                && container.CurrentLevelNo == level);
        if (alreadyApplied)
        {
            return;
        }

        var issuing = destination is null && await dbContext.StockVoucherLines.AnyAsync(
            l => l.ContainerId == container.Id
                && l.StockVoucher.Type == StockVoucherType.OUTBOUND
                && l.StockVoucher.Status == StockVoucherStatus.CONFIRMED,
            cancellationToken);
        if (destination is null && !issuing)
        {
            logger.LogInformation(
                "Container {Barcode} dropped off-shelf without an outbound voucher; stock unchanged",
                container.Barcode);
            return;
        }

        var now = DateTimeOffset.UtcNow;
        if (container is { Status: ContainerStatus.STORED, CurrentStorageLocationId: { } source })
        {
            await AdjustStockAsync(container, source, container.CurrentLevelNo ?? 1, -1, now, cancellationToken);
        }

        if (destination is { } target)
        {
            await AdjustStockAsync(container, target, level, +1, now, cancellationToken);
            container.Status = ContainerStatus.STORED;
            container.CurrentStorageLocationId = target;
            container.CurrentLevelNo = level;
        }
        else
        {
            container.Status = ContainerStatus.ISSUED;
            container.CurrentStorageLocationId = null;
            container.CurrentLevelNo = null;
        }

        container.UpdatedAt = now;
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Container {Barcode} delivered: {Status} at {StorageLocationId} level {LevelNo}",
            container.Barcode,
            container.Status,
            container.CurrentStorageLocationId,
            container.CurrentLevelNo);
    }

    private async Task AdjustStockAsync(
        Container container,
        Guid storageLocationId,
        short levelNo,
        int delta,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var stock = await dbContext.InventoryStocks.FirstOrDefaultAsync(
            s => s.ProductId == container.ProductId && s.StorageLocationId == storageLocationId && s.LevelNo == levelNo,
            cancellationToken);

        if (stock is null)
        {
            if (delta < 0)
            {
                logger.LogWarning(
                    "No stock row for Container {Barcode} at {StorageLocationId} level {LevelNo}; nothing to take off",
                    container.Barcode,
                    storageLocationId,
                    levelNo);
                return;
            }

            dbContext.InventoryStocks.Add(new InventoryStock
            {
                Id = Guid.NewGuid(),
                ProductId = container.ProductId,
                StorageLocationId = storageLocationId,
                LevelNo = levelNo,
                ContainerCount = delta,
                UpdatedAt = now
            });
            return;
        }

        if (stock.ContainerCount + delta < 0)
        {
            logger.LogWarning(
                "Stock for product {ProductId} at {StorageLocationId} level {LevelNo} would go below zero; kept at 0",
                container.ProductId,
                storageLocationId,
                levelNo);
        }

        // An empty shelf level holds no stock row, so the Inventory list only shows places that have Containers.
        if (stock.ContainerCount + delta <= 0)
        {
            dbContext.InventoryStocks.Remove(stock);
            return;
        }

        stock.ContainerCount += delta;
        stock.UpdatedAt = now;
    }

    private static bool IsRetryable(DbUpdateException exception) =>
        exception is DbUpdateConcurrencyException || UniqueViolation.ConstraintOf(exception) is not null;
}
