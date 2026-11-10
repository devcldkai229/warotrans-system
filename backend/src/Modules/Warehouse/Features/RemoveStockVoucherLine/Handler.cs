using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.RemoveStockVoucherLine;

public sealed class RemoveStockVoucherLineHandler(
    WarehouseDbContext dbContext,
    ICurrentUser currentUser,
    ILogger<RemoveStockVoucherLineHandler> logger)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(
        Guid voucherId,
        Guid lineId,
        CancellationToken cancellationToken = default)
    {
        var voucher = await StockVoucherStore.LoadAsync(dbContext, voucherId, cancellationToken);
        voucher.RemoveLine(lineId, DateTimeOffset.UtcNow);
        await StockVoucherStore.SaveAsync(dbContext, voucher, cancellationToken);

        logger.LogInformation(
            "Line {LineId} removed from stock voucher {Code} by {AccountId}",
            lineId,
            voucher.Code,
            currentUser.AccountId);

        return await StockVoucherQueries.LoadDetailAsync(dbContext, voucher.Id, cancellationToken);
    }
}
