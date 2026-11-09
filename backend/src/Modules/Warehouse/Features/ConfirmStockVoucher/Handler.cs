using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ConfirmStockVoucher;

public sealed class ConfirmStockVoucherHandler(
    WarehouseDbContext dbContext,
    IContainerTransportLookup transports,
    ICurrentUser currentUser,
    ILogger<ConfirmStockVoucherHandler> logger)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(Guid voucherId, CancellationToken cancellationToken = default)
    {
        var accountId = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");

        var voucher = await StockVoucherStore.LoadAsync(dbContext, voucherId, cancellationToken);
        await EnsureContainersStillEligibleAsync(voucher, cancellationToken);

        voucher.Confirm(accountId, DateTimeOffset.UtcNow);
        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);

        logger.LogInformation(
            "Stock voucher {Code} confirmed with {Count} Containers by {AccountId}",
            voucher.Code,
            voucher.Lines.Count,
            accountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }

    /// <summary>A Container may have moved since it was added to the DRAFT (for example issued by another voucher).</summary>
    private async Task EnsureContainersStillEligibleAsync(StockVoucher voucher, CancellationToken cancellationToken)
    {
        var ids = voucher.Lines.Select(l => l.ContainerId).ToList();
        var containers = await dbContext.Containers
            .AsNoTracking()
            .Include(c => c.CurrentStorageLocation)
            .Where(c => ids.Contains(c.Id))
            .ToListAsync(cancellationToken);

        var eligible = StockVoucher.EligibleContainerStatuses(voucher.Type);
        var stale = containers.FirstOrDefault(c => !eligible.Contains(c.Status));
        if (stale is not null)
        {
            throw new DomainValidationException(
                $"Container '{stale.Barcode}' is now {stale.Status}; remove it from voucher {voucher.Code} first.",
                "voucher_container_not_eligible");
        }

        foreach (var container in containers)
        {
            StockVoucherStore.EnsureSameWarehouse(voucher, container.Barcode, container.CurrentStorageLocation?.WarehouseId);
        }

        await StockVoucherStore.EnsureNotInTransportAsync(transports, containers, cancellationToken);
    }
}
