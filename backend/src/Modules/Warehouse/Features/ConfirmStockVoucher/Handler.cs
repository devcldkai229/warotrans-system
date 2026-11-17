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
    WarehouseDbContext dbContext,
    IContainerTransportLookup transports,
    ICurrentUser currentUser,
    ILogger<ConfirmStockVoucherHandler> logger,
    ReceivingLocationResolver receiving)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(Guid voucherId, CancellationToken cancellationToken = default)
    {
        var accountId = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");
        if (!currentUser.Can(Permissions.VoucherWrite)) throw new AppException("Voucher confirmation is not allowed.", 403, "forbidden");
        await using var transaction = dbContext.Database.IsRelational() ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        var voucher = await WarehouseWriteLocks.VoucherAsync(dbContext, voucherId, cancellationToken);
        // Outbound posting/staging is a different unfinished business flow; never claim that a document-only confirm posts stock.
        if (voucher.Type != StockVoucherType.INBOUND)
            throw new AppException("Outbound stock posting is not available yet.", 501, "outbound_stock_posting_not_supported");
        if (voucher.Status == StockVoucherStatus.CONFIRMED)
        {
            if (voucher.StockPostedAt is null)
                throw new ConflictException("This legacy confirmed voucher has no stock posting receipt; reconciliation is required.", "inbound_stock_not_posted");
            return await StockVoucherQueries.LoadDetailAsync(dbContext, voucherId, cancellationToken);
        }
        if (voucher.Status != StockVoucherStatus.DRAFT)
            throw new ConflictException("Only a DRAFT voucher can be confirmed.", "voucher_not_draft");
        if (voucher.Lines.Count == 0)
            throw new DomainValidationException("The voucher has no Containers to confirm.", "voucher_lines_required");

        var inbound = await receiving.ResolveAsync(voucher.WarehouseId, cancellationToken);
        var ids = voucher.Lines.Select(l => l.ContainerId).ToArray();
        var containers = await WarehouseWriteLocks.ContainersAsync(dbContext, ids, cancellationToken);
        if (containers.Count != ids.Length || ids.Distinct().Count() != ids.Length)
            throw new ConflictException("The voucher's Container list is incomplete.", "voucher_container_missing");
        var productIds = containers.Select(c => c.ProductId).Distinct().Order().ToArray();
        var products = dbContext.Database.IsNpgsql()
            ? await dbContext.Products.FromSqlInterpolated($"SELECT * FROM warehouse.products WHERE id = ANY({productIds}) ORDER BY id FOR SHARE").AsNoTracking().ToListAsync(cancellationToken)
            : await dbContext.Products.AsNoTracking().Where(p => productIds.Contains(p.Id)).ToListAsync(cancellationToken);
        if (products.Count != productIds.Length || products.Any(p => !p.IsActive))
            throw new DomainValidationException("Every Product must be active before stock admission.", "voucher_product_inactive");
        var linesByContainer = voucher.Lines.ToDictionary(l => l.ContainerId);
        foreach (var container in containers)
        {
            if (!StockVoucher.EligibleContainerStatuses(voucher.Type).Contains(container.Status))
                throw new DomainValidationException($"Container '{container.Barcode}' is not eligible for inbound admission.", "voucher_container_not_eligible");
            if (container.CurrentStorageLocationId != inbound.Id || container.CurrentLevelNo is not (null or 1))
                throw new ConflictException($"Container '{container.Barcode}' must be at the configured Inbound.", "voucher_container_not_at_inbound");
            if (container.ContentsQuantity is null or <= 0 || string.IsNullOrWhiteSpace(container.ContentsUnit))
                throw new DomainValidationException($"Container '{container.Barcode}' has incomplete contents.", "container_contents_incomplete");
            if (container.InboundStockVoucherId is not null || container.InventoryStorageLocationId is not null)
                throw new ConflictException($"Container '{container.Barcode}' has already been admitted to inventory.", "container_stock_already_admitted");
            if (linesByContainer[container.Id].ProductId != container.ProductId)
                throw new ConflictException("The voucher Product no longer matches its Container.", "voucher_product_mismatch");
        }
        await StockVoucherStore.EnsureNotOnOtherVoucherAsync(dbContext, voucher, ids, cancellationToken);
        await StockVoucherStore.EnsureNotInTransportAsync(transports, containers, cancellationToken);
        await WarehouseWriteLocks.StockAsync(dbContext, productIds, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        foreach (var group in containers.GroupBy(c => c.ProductId))
            await InventoryAccounting.AdjustAsync(dbContext, group.Key, inbound.Id, 1, group.Count(), now, cancellationToken);
        foreach (var container in containers)
        {
            container.InboundStockVoucherId = voucher.Id;
            container.InventoryStorageLocationId = inbound.Id;
            container.InventoryLevelNo = 1;
            container.CurrentLevelNo = 1;
            container.UpdatedAt = now;
        }
        voucher.Confirm(accountId, now);
        voucher.StockPostedAt = now;
        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        logger.LogInformation("Inbound voucher {Code} posted {Count} Containers once at {LocationId} by {AccountId}", voucher.Code, containers.Count, inbound.Id, accountId);
        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }
}
