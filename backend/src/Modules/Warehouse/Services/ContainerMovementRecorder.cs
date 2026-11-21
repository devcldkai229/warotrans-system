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
/// Confirmed inbound boxes retain their accounting slot while carried; delivery/recovery transfers that balance.
/// Physical custody (CurrentStorageLocationId) is cleared at pickup. Legacy unposted boxes retain their previous
/// shelf-counter behavior. A movement's unique key and its balance changes commit together.
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

    public static string CancelHandoverKey(Guid jobId, Guid containerId) => $"{jobId:N}:{containerId:N}:CANCEL_HANDOVER";

    public Task RecordCancelHandoverAsync(ContainerCancelHandover handover, CancellationToken cancellationToken = default) =>
        WithRetryAsync(async () =>
        {
            var key = CancelHandoverKey(handover.JobId, handover.ContainerId);
            if (await AlreadyRecordedAsync(key, cancellationToken))
                return;
            await RecoverCoreAsync(
                handover.ContainerId, handover.StorageLocationId, handover.LevelNo,
                handover.Note ?? "Unloaded by hand after its transport request was cancelled.",
                handover.ActorAccountId, cancellationToken, key);
        }, cancellationToken);

    public Task RecordPickedUpAsync(ContainerPickup pickup, CancellationToken cancellationToken = default) =>
        WithRetryAsync(() => ApplyPickupAsync(pickup, cancellationToken), cancellationToken);

    public Task RecordDeliveredAsync(ContainerDelivery delivery, CancellationToken cancellationToken = default) =>
        WithRetryAsync(() => ApplyDeliveryAsync(delivery, cancellationToken), cancellationToken);

    /// <summary>A person says where a Container that lost its place (IN_TRANSIT, HOLD) really is.</summary>
    public Task RecoverAsync(Guid containerId, Guid storageLocationId, short levelNo, string? note, Guid? actorAccountId, CancellationToken cancellationToken = default) =>
        WithRetryAsync(() => RecoverCoreAsync(containerId, storageLocationId, levelNo, note, actorAccountId, cancellationToken), cancellationToken);

    private async Task RecoverCoreAsync(
        Guid containerId,
        Guid storageLocationId,
        short levelNo,
        string? note,
        Guid? actorAccountId,
        CancellationToken cancellationToken = default,
        string? idempotencyKey = null)
    {
        var container = await LoadForMovementAsync(containerId, cancellationToken)
            ?? throw new NotFoundException($"Container '{containerId}' was not found.", "container_not_found");
        if (container.Status is not (ContainerStatus.IN_TRANSIT or ContainerStatus.HOLD))
        {
            throw new ConflictException(
                $"Container {container.Barcode} is {container.Status}; only IN_TRANSIT or HOLD can be recovered.",
                "container_not_recoverable");
        }

        var now = DateTimeOffset.UtcNow;
        var fromStatus = container.Status;
        if (HasAdmissionOrBalance(container))
            await InventoryAccounting.TransferAsync(dbContext, container, storageLocationId, levelNo, now, cancellationToken);
        else
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
            IdempotencyKey = idempotencyKey ?? $"RECOVER:{Guid.NewGuid():N}",
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

    private async Task WithRetryAsync(Func<Task> apply, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var transaction = dbContext.Database.IsRelational() ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
                await apply();
                if (transaction is not null) await transaction.CommitAsync(cancellationToken);
                return;
            }
            catch (Exception exception)
            {
                // Another move changed the same Container or stock row first, or this very key was written by a
                // concurrent retry: reload and apply again.
                dbContext.ChangeTracker.Clear();
                if (attempt >= MaxAttempts || exception is not DbUpdateException dbError || !IsRetryable(dbError))
                    throw;
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

        var container = await LoadForMovementAsync(pickup.ContainerId, cancellationToken);
        if (await AlreadyRecordedAsync(key, cancellationToken)) return;
        if (container is null)
        {
            logger.LogWarning("Picked-up Container {ContainerId} does not exist in Warehouse", pickup.ContainerId);
            return;
        }

        if (container.Status is ContainerStatus.IN_TRANSIT or ContainerStatus.ISSUED or ContainerStatus.STAGED_OUTBOUND)
        {
            logger.LogWarning(
                "Container {Barcode} picked up while {Status}; stock unchanged",
                container.Barcode,
                container.Status);
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var movement = NewMovement(ContainerMovementType.PICKED_UP, container, key, pickup.JobId, pickup.TransportRequestId, now);
        if (pickup.OutboundEndpointId.HasValue)
            await HoldStagingBalanceAsync(container, pickup.WarehouseId, cancellationToken);
        if (!HasAdmissionOrBalance(container) && container is { Status: ContainerStatus.STORED, CurrentStorageLocationId: { } source })
        {
            await AdjustStockAsync(container, source, container.CurrentLevelNo ?? 1, -1, now, cancellationToken);
        }

        container.Status = ContainerStatus.IN_TRANSIT;
        container.CurrentStorageLocationId = null;
        container.CurrentLevelNo = null;
        container.CurrentEndpointId = null;
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

        var container = await LoadForMovementAsync(delivery.ContainerId, cancellationToken);
        if (await AlreadyRecordedAsync(key, cancellationToken)) return;
        if (container is null)
        {
            logger.LogWarning("Delivered Container {ContainerId} does not exist in Warehouse", delivery.ContainerId);
            return;
        }

        var destination = delivery.DestinationStorageLocationId;
        var level = delivery.DestinationLevelNo ?? 1;
        var now = DateTimeOffset.UtcNow;
        var movement = NewMovement(ContainerMovementType.DELIVERED, container, key, delivery.JobId, delivery.TransportRequestId, now);

        if (container.Status is ContainerStatus.ISSUED or ContainerStatus.STAGED_OUTBOUND)
            return;

        if (delivery.OutboundEndpointId is { } outboundGate && destination is null)
        {
            await HoldStagingBalanceAsync(container, delivery.WarehouseId, cancellationToken);
            container.Status = ContainerStatus.STAGED_OUTBOUND;
            container.CurrentStorageLocationId = null;
            container.CurrentLevelNo = null;
            container.CurrentEndpointId = outboundGate;
        }
        else
        {
            await DeliverToStorageOrOffShelfAsync(delivery, container, movement, level, now, cancellationToken);
        }

        container.UpdatedAt = now;
        movement.ToStatus = container.Status;
        movement.ToStorageLocationId = container.CurrentStorageLocationId;
        movement.ToLevelNo = container.CurrentLevelNo;
        movement.ToEndpointId = container.CurrentEndpointId;
        dbContext.ContainerMovements.Add(movement);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Container {Barcode} delivered: {Status} at {StorageLocationId} or gate {EndpointId}",
            container.Barcode, container.Status, container.CurrentStorageLocationId, container.CurrentEndpointId);
    }

    private async Task DeliverToStorageOrOffShelfAsync(
        ContainerDelivery delivery, Container container, ContainerMovement movement, short level, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var destination = delivery.DestinationStorageLocationId;
        container.CurrentEndpointId = null;
        var alreadyThere = container.Status == ContainerStatus.STORED
            && container.CurrentStorageLocationId == destination
            && container.CurrentLevelNo == level;

        // Picked up before this ledger existed, or the pickup post was lost: the Container still counts on its shelf.
        if (!alreadyThere && !HasAdmissionOrBalance(container) && container is { Status: ContainerStatus.STORED, CurrentStorageLocationId: { } source })
        {
            await AdjustStockAsync(container, source, container.CurrentLevelNo ?? 1, -1, now, cancellationToken);
        }

        if (destination is { } target)
        {
            if (HasAdmissionOrBalance(container))
                await InventoryAccounting.TransferAsync(dbContext, container, target, level, now, cancellationToken);
            else if (!alreadyThere)
                await AdjustStockAsync(container, target, level, +1, now, cancellationToken);

            container.Status = ContainerStatus.STORED;
            container.CurrentStorageLocationId = target;
            container.CurrentLevelNo = level;
        }
        else if (HasAdmissionOrBalance(container))
        {
            // No accounting location at an endpoint-only drop. Retain ownership and its last accounting slot.
            // Outbound stock posting is deliberately not performed by robot delivery.
            container.Status = ContainerStatus.HOLD;
            container.CurrentStorageLocationId = null;
            container.CurrentLevelNo = null;
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
    }

    private async Task HoldStagingBalanceAsync(Container container, Guid? warehouseId, CancellationToken ct)
    {
        var locationId = container.InventoryStorageLocationId ?? container.CurrentStorageLocationId;
        var level = container.InventoryLevelNo ?? container.CurrentLevelNo ?? 1;
        var location = locationId.HasValue
            ? await dbContext.StorageLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
            : null;
        if (!warehouseId.HasValue || location is null || location.WarehouseId != warehouseId
            || (container.WarehouseId.HasValue && container.WarehouseId != warehouseId)
            || !await dbContext.InventoryStocks.AnyAsync(s => s.ProductId == container.ProductId
                && s.StorageLocationId == location.Id && s.LevelNo == level && s.ContainerCount > 0, ct))
            throw new ConflictException("A Container must have booked warehouse stock before staging for outbound.", "inventory_balance_missing");

        container.WarehouseId = warehouseId;
        container.InventoryStorageLocationId = location.Id;
        container.InventoryLevelNo = level;
    }

    private static bool HasAdmissionOrBalance(Container container) =>
        container.InboundStockVoucherId.HasValue || container.InventoryStorageLocationId.HasValue;

    private async Task<Container?> LoadForMovementAsync(Guid containerId, CancellationToken ct)
    {
        var container = (await WarehouseWriteLocks.ContainersAsync(dbContext, [containerId], ct)).SingleOrDefault();
        if (container is null) return null;
        if (container.CreationRequestId is not null && container.InboundStockVoucherId is null)
            throw new ConflictException("Confirm the inbound stock voucher before moving this receiving batch.", "inbound_voucher_required");
        await WarehouseWriteLocks.StockAsync(dbContext, [container.ProductId], ct);
        return container;
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
            FromEndpointId = container.CurrentEndpointId,
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
