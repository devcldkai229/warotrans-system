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

        var voucher = await StockVoucherStore.LoadAsync(dbContext, voucherId, cancellationToken);
        voucher.Cancel(accountId, DateTimeOffset.UtcNow);
        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);

        logger.LogInformation("Stock voucher {Code} cancelled by {AccountId}", voucher.Code, accountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }
}
