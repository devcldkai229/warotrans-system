using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Services;

/// <summary>
/// WH-01: Container location and InventoryStock follow custody (counts are Containers, rules/00).
/// Picked up: 1 off the shelf level (the row goes when it reaches 0), the Container is IN_TRANSIT with no location.
/// Delivered to a shelf: 1 on that level, STORED. Delivered off-shelf on a CONFIRMED outbound voucher: ISSUED.
/// Any other off-shelf drop: back to its status before the pickup if it never was on a shelf, otherwise HOLD.
/// Each move writes one <see cref="ContainerMovement"/> in the same transaction; its unique key makes a retry a no-op.
/// </summary>
public sealed class ContainerMovementRecorder(
    WarehouseDbContext dbContext,
    ILogger<ContainerMovementRecorder> logger) : IContainerMovementRecorder
{
    private const int MaxAttempts = 3;

    private static readonly ContainerStatus[] NeverShelved =
        [ContainerStatus.CREATED, ContainerStatus.PACKED, ContainerStatus.RESERVED];

    public static string PickupKey(Guid jobId, Guid containerId) => $"{jobId:N}:{containerId:N}:PICKUP";

    public static string DeliveryKey(Guid jobId, Guid containerId) => $"{jobId:N}:{containerId:N}:DELIVERY";

    public Task RecordPickedUpAsync(ContainerPickup pickup, CancellationToken cancellationToken = default) =>
        WithRetryAsync(() => ApplyPickupAsync(pickup, cancellationToken));

    public Task RecordDeliveredAsync(ContainerDelivery delivery, CancellationToken cancellationToken = default) =>
        WithRetryAsync(() => ApplyDeliveryAsync(delivery, cancellationToken));

    /// <summary>A person says where a Container that lost its place (IN_TRANSIT, HOLD) really is.</summary>
    public async Task RecoverAsync(
        Guid containerId,
        Guid storageLocationId,
        short levelNo,
        string? note,
        Guid? actorAccountId,
        CancellationToken cancellationToken = default)
    {
        var container = await dbContext.Containers.FirstOrDefaultAsync(c => c.Id == containerId, cancellationToken)
            ?? throw new NotFoundException($"Container '{containerId}' was not found.", "container_not_found");
        if (container.Status is not (ContainerStatus.IN_TRANSIT or ContainerStatus.HOLD))
        {
            throw new ConflictException(
                $"Container {container.Barcode} is {container.Status}; only IN_TRANSIT or HOLD can be recovered.",
                "container_not_recoverable");
        }

        var now = DateTimeOffset.UtcNow;
        var fromStatus = container.Status;
        await AdjustStockAsync(container, storageLocationId, levelNo, +1, now, cancellationToken);
        container.Status = ContainerStatus.STORED;
        container.CurrentStorageLocationId = storageLocationId;
        container.CurrentLevelNo = levelNo;
        container.UpdatedAt = now;
        dbContext.ContainerMovements.Add(new ContainerMovement
        {
            Id = Guid.NewGuid(),
            ContainerId = container.Id,
            Type = ContainerMovementType.RECOVERED,
            FromStatus = fromStatus,
            ToStatus = container.Status,
            ToStorageLocationId = storageLocationId,
            ToLevelNo = levelNo,
            IdempotencyKey = $"RECOVER:{Guid.NewGuid():N}",
            ActorAccountId = actorAccountId,
            Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
            OccurredAt = now
        });

        try
        {
            // Container.UpdatedAt is the concurrency token: two people recovering at once cannot both add stock.
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException($"Container {container.Barcode} was changed at the same time.", "container_conflict");
        }
    }

    private async Task WithRetryAsync(Func<Task> apply)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await apply();
                return;
            }
            catch (DbUpdateException exception) when (attempt < MaxAttempts && IsRetryable(exception))
            {
                // Another move changed the same Container or stock row first, or this very key was written by a
                // concurrent retry: reload and apply again.
                dbContext.ChangeTracker.Clear();
            }
        }
    }

    private Task<bool> AlreadyRecordedAsync(string key, CancellationToken cancellationToken) =>
        dbContext.ContainerMovements.AnyAsync(m => m.IdempotencyKey == key, cancellationToken);

    private async Task ApplyPickupAsync(ContainerPickup pickup, CancellationToken cancellationToken)
    {
        var key = PickupKey(pickup.JobId, pickup.ContainerId);
        if (await AlreadyRecordedAsync(key, cancellationToken))
        {
            return;
        }

        var container = await dbContext.Containers.FirstOrDefaultAsync(c => c.Id == pickup.ContainerId, cancellationToken);
        if (container is null)
        {
            logger.LogWarning("Picked-up Container {ContainerId} does not exist in Warehouse", pickup.ContainerId);
            return;
        }

        if (container.Status is ContainerStatus.IN_TRANSIT or ContainerStatus.ISSUED)
        {
            logger.LogWarning(
                "Container {Barcode} picked up while {Status}; stock unchanged",
                container.Barcode,
                container.Status);
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var movement = NewMovement(ContainerMovementType.PICKED_UP, container, key, pickup.JobId, pickup.TransportRequestId, now);
        if (container is { Status: ContainerStatus.STORED, CurrentStorageLocationId: { } source })
        {
            await AdjustStockAsync(container, source, container.CurrentLevelNo ?? 1, -1, now, cancellationToken);
        }

        container.Status = ContainerStatus.IN_TRANSIT;
        container.CurrentStorageLocationId = null;
        container.CurrentLevelNo = null;
        container.UpdatedAt = now;
        movement.ToStatus = container.Status;
        dbContext.ContainerMovements.Add(movement);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Container {Barcode} picked up from {StorageLocationId}", container.Barcode, movement.FromStorageLocationId);
    }

    private async Task ApplyDeliveryAsync(ContainerDelivery delivery, CancellationToken cancellationToken)
    {
        var key = DeliveryKey(delivery.JobId, delivery.ContainerId);
        if (await AlreadyRecordedAsync(key, cancellationToken))
        {
            return;
        }

        var container = await dbContext.Containers.FirstOrDefaultAsync(c => c.Id == delivery.ContainerId, cancellationToken);
        if (container is null)
        {
            logger.LogWarning("Delivered Container {ContainerId} does not exist in Warehouse", delivery.ContainerId);
            return;
        }

        var destination = delivery.DestinationStorageLocationId;
        var level = delivery.DestinationLevelNo ?? 1;
        var now = DateTimeOffset.UtcNow;
        var movement = NewMovement(ContainerMovementType.DELIVERED, container, key, delivery.JobId, delivery.TransportRequestId, now);

        var alreadyThere = container.Status == ContainerStatus.STORED
            && container.CurrentStorageLocationId == destination
            && container.CurrentLevelNo == level;

        // Picked up before this ledger existed, or the pickup post was lost: the Container still counts on its shelf.
        if (!alreadyThere && container is { Status: ContainerStatus.STORED, CurrentStorageLocationId: { } source })
        {
            await AdjustStockAsync(container, source, container.CurrentLevelNo ?? 1, -1, now, cancellationToken);
        }

        if (destination is { } target)
        {
            if (!alreadyThere)
            {
                await AdjustStockAsync(container, target, level, +1, now, cancellationToken);
            }

            container.Status = ContainerStatus.STORED;
            container.CurrentStorageLocationId = target;
            container.CurrentLevelNo = level;
        }
        else if (await IsOnConfirmedOutboundVoucherAsync(container.Id, cancellationToken))
        {
            movement.Type = ContainerMovementType.ISSUED;
            container.Status = ContainerStatus.ISSUED;
            container.CurrentStorageLocationId = null;
            container.CurrentLevelNo = null;
        }
        else
        {
            var pickupKey = PickupKey(delivery.JobId, delivery.ContainerId);
            var before = await dbContext.ContainerMovements
                .Where(m => m.IdempotencyKey == pickupKey)
                .Select(m => (ContainerStatus?)m.FromStatus)
                .FirstOrDefaultAsync(cancellationToken) ?? container.Status;
            container.Status = NeverShelved.Contains(before) ? before : ContainerStatus.HOLD;
            container.CurrentStorageLocationId = null;
            container.CurrentLevelNo = null;
            logger.LogWarning(
                "Container {Barcode} dropped off-shelf without an outbound voucher: now {Status}",
                container.Barcode,
                container.Status);
        }

        container.UpdatedAt = now;
        movement.ToStatus = container.Status;
        movement.ToStorageLocationId = container.CurrentStorageLocationId;
        movement.ToLevelNo = container.CurrentLevelNo;
        dbContext.ContainerMovements.Add(movement);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Container {Barcode} delivered: {Status} at {StorageLocationId} level {LevelNo}",
            container.Barcode,
            container.Status,
            container.CurrentStorageLocationId,
            container.CurrentLevelNo);
    }

    private Task<bool> IsOnConfirmedOutboundVoucherAsync(Guid containerId, CancellationToken cancellationToken) =>
        dbContext.StockVoucherLines.AnyAsync(
            l => l.ContainerId == containerId
                && l.StockVoucher.Type == StockVoucherType.OUTBOUND
                && l.StockVoucher.Status == StockVoucherStatus.CONFIRMED,
            cancellationToken);

    private static ContainerMovement NewMovement(
        ContainerMovementType type,
        Container container,
        string key,
        Guid jobId,
        Guid transportRequestId,
        DateTimeOffset now) =>
        new()
        {
            Id = Guid.NewGuid(),
            ContainerId = container.Id,
            Type = type,
            FromStatus = container.Status,
            ToStatus = container.Status,
            FromStorageLocationId = container.CurrentStorageLocationId,
            FromLevelNo = container.CurrentLevelNo,
            JobId = jobId,
            TransportRequestId = transportRequestId,
            IdempotencyKey = key,
            OccurredAt = now
        };

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
