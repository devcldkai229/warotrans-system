using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Features.Shared;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.CloseStockVoucherShort;

/// <summary>
/// A CONFIRMED voucher whose remaining Containers will not be moved (a cancelled Job, goods no longer wanted): people
/// close it short. Containers already done keep their stock; the others leave the voucher as they are.
/// </summary>
public sealed class CloseStockVoucherShortHandler(
    WarehouseDbContext db,
    IContainerTransportLookup transports,
    ICurrentUser currentUser,
    ILogger<CloseStockVoucherShortHandler> logger)
{
    public async Task<StockVoucherDetailResponse> HandleAsync(
        Guid voucherId,
        CloseStockVoucherShortRequest request,
        CancellationToken cancellationToken = default)
    {
        var accountId = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new DomainValidationException("Say why the voucher is closed short.", "voucher_close_reason_required");
        }

        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(cancellationToken) : null;
        var voucher = await WarehouseWriteLocks.VoucherAsync(db, voucherId, cancellationToken);
        if (voucher.Status != StockVoucherStatus.CONFIRMED)
        {
            throw new ConflictException(
                $"Voucher {voucher.Code} is {voucher.Status}; only a CONFIRMED voucher can be closed short.",
                "voucher_not_confirmed");
        }

        var openIds = voucher.Lines.Where(l => l.IsOpen).Select(l => l.ContainerId).ToArray();
        var containers = (await WarehouseWriteLocks.ContainersAsync(db, openIds, cancellationToken)).ToDictionary(c => c.Id);
        bool Done(StockVoucherLine line) =>
            containers.TryGetValue(line.ContainerId, out var box) && StockVoucherProgress.IsDone(voucher.Type, box.Status);

        var waiting = voucher.Lines.Where(l => l.IsOpen && !Done(l)).Select(l => containers[l.ContainerId]).ToList();
        await StockVoucherStore.EnsureNotInTransportAsync(transports, waiting, cancellationToken);
        if (waiting.FirstOrDefault(c => c.Status == ContainerStatus.IN_TRANSIT) is { } carried)
        {
            throw new ConflictException(
                $"Container '{carried.Barcode}' is still recorded on a robot. Recover it to the shelf it is on first.",
                "voucher_container_in_transit");
        }

        var now = DateTimeOffset.UtcNow;
        var closed = voucher.CloseShort(accountId, request.Reason, Done, now);
        if (voucher.Type == StockVoucherType.INBOUND)
        {
            // Not put away: the Container is no longer admitted, so no robot moves it without a new phiếu nhập.
            foreach (var line in closed)
            {
                var box = containers[line.ContainerId];
                if (box.InboundStockVoucherId == voucher.Id && box.InventoryStorageLocationId is null)
                {
                    box.InboundStockVoucherId = null;
                    box.UpdatedAt = now;
                }
            }
        }

        await StockVoucherStore.SaveAsync(db, voucher, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        logger.LogInformation(
            "Stock voucher {Code} closed short by {AccountId}: {Closed} line(s) dropped, now {Status}. Reason: {Reason}",
            voucher.Code,
            accountId,
            closed.Count,
            voucher.Status,
            voucher.ClosedShortReason);
        return await StockVoucherQueries.LoadDetailAsync(db, voucher.Id, cancellationToken);
    }
}
