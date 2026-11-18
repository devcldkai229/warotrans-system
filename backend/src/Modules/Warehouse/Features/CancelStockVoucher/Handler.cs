using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CancelStockVoucher;

public sealed class CancelStockVoucherHandler(
    WarehouseDbContext dbContext,
    ICurrentUser currentUser,
    ILogger<CancelStockVoucherHandler> logger)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(Guid voucherId, CancellationToken cancellationToken = default)
    {
        var accountId = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");

        await using var transaction = dbContext.Database.IsRelational() ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        var voucher = await WarehouseWriteLocks.VoucherAsync(dbContext, voucherId, cancellationToken);
        voucher.Cancel(accountId, DateTimeOffset.UtcNow);
        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        logger.LogInformation("Stock voucher {Code} cancelled by {AccountId}", voucher.Code, accountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }
}
