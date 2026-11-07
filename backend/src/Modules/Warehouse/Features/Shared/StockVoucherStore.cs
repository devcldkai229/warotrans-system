using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.Shared;

/// <summary>Loading and saving a voucher for the slices that change it.</summary>
internal static class StockVoucherStore
{
    public static async Task<StockVoucher> LoadAsync(WarehouseDbContext db, Guid id, CancellationToken cancellationToken) =>
        await db.StockVouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == id, cancellationToken)
        ?? throw new NotFoundException($"Stock voucher '{id}' was not found.", "stock_voucher_not_found");

    /// <summary>
    /// A Container may be on one live (not CANCELLED) voucher of each type, so two phiếu xuất cannot claim it.
    /// </summary>
    public static async Task EnsureNotOnOtherVoucherAsync(
        WarehouseDbContext db,
        StockVoucher voucher,
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken)
    {
        var taken = await db.StockVoucherLines
            .AsNoTracking()
            .Where(l => containerIds.Contains(l.ContainerId)
                && l.StockVoucherId != voucher.Id
                && l.StockVoucher.Type == voucher.Type
                && l.StockVoucher.Status != StockVoucherStatus.CANCELLED)
            .Select(l => new { l.Container!.Barcode, l.StockVoucher.Code })
            .FirstOrDefaultAsync(cancellationToken);

        if (taken is not null)
        {
            throw new ConflictException(
                $"Container '{taken.Barcode}' is already on voucher {taken.Code}.",
                "voucher_container_on_other_voucher");
        }
    }

    /// <summary>Outbound Containers must sit on a shelf of the voucher's warehouse; inbound ones on no other warehouse's shelf.</summary>
    /// <summary>
    /// A Container a robot is already moving (open TransportRequest) cannot go on a voucher: once the voucher is
    /// CONFIRMED it could not be dispatched, nor taken off the voucher again.
    /// </summary>
    public static async Task EnsureNotInTransportAsync(
        IContainerTransportLookup transports,
        IReadOnlyCollection<Container> containers,
        CancellationToken cancellationToken)
    {
        var busy = await transports.GetContainersInActiveTransportAsync(containers.Select(c => c.Id).ToList(), cancellationToken);
        var moving = containers.FirstOrDefault(c => busy.Contains(c.Id));
        if (moving is not null)
        {
            throw new ConflictException(
                $"Container '{moving.Barcode}' is already part of an active Transport Request; wait until it finishes.",
                "voucher_container_in_transport");
        }
    }

    /// <param name="shelfWarehouseId">Warehouse of the Container's current StorageLocation; null when unshelved.</param>
    public static void EnsureSameWarehouse(StockVoucher voucher, string barcode, Guid? shelfWarehouseId)
    {
        var wrong = voucher.Type == StockVoucherType.OUTBOUND
            ? shelfWarehouseId != voucher.WarehouseId
            : shelfWarehouseId.HasValue && shelfWarehouseId != voucher.WarehouseId;

        if (wrong)
        {
            throw new DomainValidationException(
                $"Container '{barcode}' is not in the warehouse of voucher {voucher.Code}.",
                "voucher_container_wrong_warehouse");
        }
    }

    public static async Task SaveAsync(WarehouseDbContext db, StockVoucher voucher, CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException(
                $"Voucher {voucher.Code} was changed by someone else; reload it and try again.",
                "stock_voucher_changed");
        }
        catch (DbUpdateException exception) when (UniqueViolation.ConstraintOf(exception) is not null)
        {
            throw new ConflictException(
                $"Voucher {voucher.Code} was changed by someone else; reload it and try again.",
                "stock_voucher_changed");
        }
    }
}
