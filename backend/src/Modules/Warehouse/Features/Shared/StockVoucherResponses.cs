using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.Shared;

/// <param name="Done">INBOUND: the Container reached a shelf (STORED, or ISSUED later). OUTBOUND: it is ISSUED.</param>
public sealed record StockVoucherLineResponse(
    Guid Id,
    int LineNo,
    Guid ContainerId,
    string ContainerBarcode,
    string ContainerStatus,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    Guid? CurrentStorageLocationId,
    string? CurrentStorageLocationCode,
    Guid? CurrentEndpointId,
    short? CurrentLevelNo,
    bool Done,
    decimal? ContentsQuantity = null,
    string? ContentsUnit = null);

public sealed record StockVoucherProductSummary(
    Guid ProductId,
    string ProductSku,
    string ProductName,
    int ContainerCount,
    int DoneCount);

/// <param name="ContainerCount">The voucher quantity: one line per Container (rules/00).</param>
/// <param name="DoneCount">Robot progress, read from the Containers; it never changes <paramref name="Status"/>.</param>
public sealed record StockVoucherDetailResponse(
    Guid Id,
    string Code,
    string Type,
    string Status,
    Guid WarehouseId,
    string WarehouseCode,
    string WarehouseName,
    string? ReferenceNo,
    string? Note,
    Guid CreatedBy,
    DateTimeOffset CreatedAt,
    Guid? ConfirmedBy,
    DateTimeOffset? ConfirmedAt,
    Guid? CancelledBy,
    DateTimeOffset? CancelledAt,
    DateTimeOffset UpdatedAt,
    int ContainerCount,
    int DoneCount,
    IReadOnlyList<StockVoucherProductSummary> Products,
    IReadOnlyList<StockVoucherLineResponse> Lines);

internal static class StockVoucherProgress
{
    public static bool IsDone(StockVoucherType type, ContainerStatus status) =>
        type == StockVoucherType.INBOUND
            ? status is ContainerStatus.STORED or ContainerStatus.ISSUED
            : status == ContainerStatus.ISSUED;
}

internal static class StockVoucherQueries
{
    public static async Task<StockVoucherDetailResponse> LoadDetailAsync(
        WarehouseDbContext db,
        Guid id,
        CancellationToken cancellationToken)
    {
        var voucher = await db.StockVouchers
            .AsNoTracking()
            .Where(v => v.Id == id)
            .Select(v => new
            {
                v.Id,
                v.Code,
                v.Type,
                v.Status,
                v.WarehouseId,
                v.ReferenceNo,
                v.Note,
                v.CreatedBy,
                v.CreatedAt,
                v.ConfirmedBy,
                v.ConfirmedAt,
                v.CancelledBy,
                v.CancelledAt,
                v.UpdatedAt
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Stock voucher '{id}' was not found.", "stock_voucher_not_found");

        var warehouse = await db.Warehouses
            .AsNoTracking()
            .Where(w => w.Id == voucher.WarehouseId)
            .Select(w => new { w.Code, w.Name })
            .FirstOrDefaultAsync(cancellationToken);

        var rows = await db.StockVoucherLines
            .AsNoTracking()
            .Where(l => l.StockVoucherId == id)
            .OrderBy(l => l.LineNo)
            .Select(l => new
            {
                l.Id,
                l.LineNo,
                l.ContainerId,
                Barcode = l.Container!.Barcode,
                ContainerStatus = l.Container.Status,
                l.ProductId,
                Sku = l.Product!.Sku,
                ProductName = l.Product.Name,
                l.Container.CurrentStorageLocationId,
                LocationCode = l.Container.CurrentStorageLocation != null ? l.Container.CurrentStorageLocation.Code : null,
                EndpointId = l.Container.CurrentStorageLocation != null ? l.Container.CurrentStorageLocation.EndpointId : (Guid?)null,
                l.Container.CurrentLevelNo,
                l.Container.ContentsQuantity,
                l.Container.ContentsUnit
            })
            .ToListAsync(cancellationToken);

        var lines = rows
            .Select(r => new StockVoucherLineResponse(
                r.Id,
                r.LineNo,
                r.ContainerId,
                r.Barcode,
                r.ContainerStatus.ToString(),
                r.ProductId,
                r.Sku,
                r.ProductName,
                r.CurrentStorageLocationId,
                r.LocationCode,
                r.EndpointId,
                r.CurrentLevelNo,
                StockVoucherProgress.IsDone(voucher.Type, r.ContainerStatus), r.ContentsQuantity, r.ContentsUnit))
            .ToList();

        var products = lines
            .GroupBy(l => (l.ProductId, l.ProductSku, l.ProductName))
            .Select(g => new StockVoucherProductSummary(g.Key.ProductId, g.Key.ProductSku, g.Key.ProductName, g.Count(), g.Count(l => l.Done)))
            .OrderBy(p => p.ProductSku)
            .ToList();

        return new StockVoucherDetailResponse(
            voucher.Id,
            voucher.Code,
            voucher.Type.ToString(),
            voucher.Status.ToString(),
            voucher.WarehouseId,
            warehouse?.Code ?? string.Empty,
            warehouse?.Name ?? string.Empty,
            voucher.ReferenceNo,
            voucher.Note,
            voucher.CreatedBy,
            voucher.CreatedAt,
            voucher.ConfirmedBy,
            voucher.ConfirmedAt,
            voucher.CancelledBy,
            voucher.CancelledAt,
            voucher.UpdatedAt,
            lines.Count,
            lines.Count(l => l.Done),
            products,
            lines);
    }
}
