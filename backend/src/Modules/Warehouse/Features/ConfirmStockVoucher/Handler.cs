using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ConfirmStockVoucher;

public sealed class ConfirmStockVoucherHandler(
    WarehouseDbContext db,
    IContainerTransportLookup transports,
    ICurrentUser currentUser,
    ILogger<ConfirmStockVoucherHandler> logger,
    IMapEndpointCatalog map)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(Guid voucherId, CancellationToken cancellationToken = default)
    {
        var accountId = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");
        if (!currentUser.Can(Permissions.VoucherWrite))
            throw new AppException("Voucher confirmation is not allowed.", 403, "forbidden");

        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        var voucher = await WarehouseWriteLocks.VoucherAsync(db, voucherId, cancellationToken);
        if (voucher.Status is StockVoucherStatus.CONFIRMED or StockVoucherStatus.COMPLETED)
        {
            if (voucher.StockPostedAt is null)
                throw new ConflictException("This legacy confirmed voucher has no stock posting receipt. Reconcile it before using it.",
                    voucher.Type == StockVoucherType.INBOUND ? "inbound_stock_not_posted" : "outbound_stock_not_posted");
            return await StockVoucherQueries.LoadDetailAsync(db, voucherId, cancellationToken);
        }

        await ConfirmAsync(voucher, accountId, cancellationToken);
        await StockVoucherStore.SaveAsync(db, voucher, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        logger.LogInformation("{Type} voucher {Code} confirmed with {Count} Containers by {AccountId}", voucher.Type, voucher.Code, voucher.Lines.Count, accountId);
        return await StockVoucherQueries.LoadDetailAsync(db, voucher.Id, cancellationToken);
    }

    /// <summary>
    /// Confirms a DRAFT voucher locked by the caller, without saving. Inbound admits the received Containers (no stock
    /// yet: it is booked shelf by shelf as robots put them away). Outbound reserves Containers still on their shelves
    /// (no stock change: it comes off when a robot delivers each one to an Outbound gate).
    /// </summary>
    internal async Task ConfirmAsync(StockVoucher voucher, Guid accountId, CancellationToken cancellationToken)
    {
        if (voucher.Status != StockVoucherStatus.DRAFT)
            throw new ConflictException("Only a DRAFT voucher can be confirmed.", "voucher_not_draft");
        if (voucher.Lines.Count == 0)
            throw new DomainValidationException("The voucher has no Containers to confirm.", "voucher_lines_required");
        if (!await db.Warehouses.AnyAsync(w => w.Id == voucher.WarehouseId && w.IsActive, cancellationToken))
            throw new NotFoundException("The warehouse was not found or is inactive.", "warehouse_not_found");

        var lines = voucher.Lines.ToDictionary(l => l.ContainerId);
        var containers = await WarehouseWriteLocks.ContainersAsync(db, lines.Keys, cancellationToken);
        if (containers.Count != lines.Count)
            throw new ConflictException("The voucher's Container list is incomplete.", "voucher_container_missing");
        if (containers.Any(c => lines[c.Id].ProductId != c.ProductId))
            throw new ConflictException("A voucher Product no longer matches its Container.", "voucher_product_mismatch");

        await StockVoucherStore.EnsureNotOnOtherVoucherAsync(db, voucher, lines.Keys, cancellationToken);
        await StockVoucherStore.EnsureNotInTransportAsync(transports, containers, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        if (voucher.Type == StockVoucherType.INBOUND)
            await AdmitAsync(voucher, containers, now, cancellationToken);
        else
            await OutboundStock.EnsureEligibleAsync(db, voucher.WarehouseId, containers, cancellationToken);

        voucher.Confirm(accountId, now);
    }

    private async Task AdmitAsync(StockVoucher voucher, IReadOnlyList<Container> boxes, DateTimeOffset now, CancellationToken ct)
    {
        var productIds = boxes.Select(c => c.ProductId).Distinct().Order().ToArray();
        var products = db.Database.IsNpgsql()
            ? await db.Products.FromSqlInterpolated($"SELECT * FROM warehouse.products WHERE id = ANY({productIds}) ORDER BY id FOR SHARE").AsNoTracking().ToListAsync(ct)
            : await db.Products.AsNoTracking().Where(p => productIds.Contains(p.Id)).ToListAsync(ct);
        if (products.Count != productIds.Length || products.Any(p => !p.IsActive))
            throw new DomainValidationException("Every Product must be active before stock admission.", "voucher_product_inactive");

        var locatedIds = boxes.Select(b => b.CurrentStorageLocationId).OfType<Guid>().Distinct().ToArray();
        var receivingLocations = new HashSet<Guid>();
        if (locatedIds.Length > 0)
        {
            // Batches created before unlocated receiving could have an Inbound StorageLocation assigned.
            var gates = (await map.GetPublishedEndpointsAsync(voucher.WarehouseId, ct))
                .Where(e => e.IsEnabled && WarehouseGate.IsInbound(e.Code, e.EndpointType)).Select(e => e.Id).ToArray();
            receivingLocations = (await db.StorageLocations.AsNoTracking()
                .Where(l => locatedIds.Contains(l.Id) && l.WarehouseId == voucher.WarehouseId && gates.Contains(l.EndpointId))
                .Select(l => l.Id).ToListAsync(ct)).ToHashSet();
        }

        foreach (var box in boxes)
        {
            if (box.Status is not (ContainerStatus.CREATED or ContainerStatus.PACKED))
                throw new DomainValidationException($"Container '{box.Barcode}' is not eligible for inbound admission.", "voucher_container_not_eligible");
            if (box.WarehouseId is { } owner && owner != voucher.WarehouseId)
                throw new ConflictException($"Container '{box.Barcode}' belongs to another warehouse.", "voucher_container_wrong_warehouse");
            if (box.CurrentEndpointId.HasValue || (box.CurrentStorageLocationId is { } location && !receivingLocations.Contains(location)))
                throw new ConflictException($"Container '{box.Barcode}' already has a non-receiving location.", "voucher_container_already_located");
            if (box.ContentsQuantity is null or <= 0 || string.IsNullOrWhiteSpace(box.ContentsUnit))
                throw new DomainValidationException($"Container '{box.Barcode}' has incomplete contents.", "container_contents_incomplete");
            if (box.InboundStockVoucherId.HasValue || box.InventoryStorageLocationId.HasValue)
                throw new ConflictException($"Container '{box.Barcode}' has already been admitted to inventory.", "container_stock_already_admitted");
        }

        foreach (var box in boxes)
        {
            box.WarehouseId = voucher.WarehouseId;
            box.InboundStockVoucherId = voucher.Id;
            box.Status = ContainerStatus.CREATED;
            box.CurrentStorageLocationId = null;
            box.CurrentLevelNo = null;
            box.UpdatedAt = now;
        }
    }
}
