using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListContainers;

public sealed class ListContainersHandler(WarehouseDbContext db, IContainerTransportLookup transports)
{
    private static readonly ContainerStatus[] EligibleStatuses =
    [
        ContainerStatus.CREATED,
        ContainerStatus.PACKED,
        ContainerStatus.STORED
    ];

    public async Task<ListContainersResponse> HandleAsync(
        ListContainersRequest request,
        CancellationToken cancellationToken)
    {
        // Batch and staged Containers retain warehouse ownership even without a shelf. Legacy unbound rows stay visible.
        var query = db.Containers
            .AsNoTracking()
            .Where(c =>
                c.WarehouseId == request.WarehouseId
                || (c.WarehouseId == null && (c.CurrentStorageLocationId == null
                    || c.CurrentStorageLocation!.WarehouseId == request.WarehouseId)));

        if (request.EligibleOnly)
        {
            query = query.Where(c => EligibleStatuses.Contains(c.Status));
        }

        // The validator has already refused a name that is not a ContainerStatus.
        if (!string.IsNullOrEmpty(request.Status))
        {
            var status = Enum.Parse<ContainerStatus>(request.Status);
            query = query.Where(c => c.Status == status);
        }

        if (request.AwaitingInbound)
        {
            query = query.Where(c => c.Status == ContainerStatus.CREATED
                                     && c.InboundStockVoucherId == null
                                     && c.InventoryStorageLocationId == null
                                     && !db.StockVoucherLines.Any(l =>
                                         l.ContainerId == c.Id
                                         && l.StockVoucher.Type == StockVoucherType.INBOUND
                                         && l.StockVoucher.Status != StockVoucherStatus.CANCELLED
                                         && l.ClosedShortAt == null));
        }

        if (request.ProductId is { } productId)
        {
            query = query.Where(c => c.ProductId == productId);
        }

        if (request.StorageLocationId is { } locationId)
        {
            var level = request.LevelNo;
            query = query.Where(c =>
                (c.CurrentStorageLocationId == locationId && (level == null || c.CurrentLevelNo == level))
                || (c.InventoryStorageLocationId == locationId && (level == null || c.InventoryLevelNo == level)));
        }

        var byVoucher = !string.IsNullOrEmpty(request.VoucherType);
        if (byVoucher)
        {
            var type = Enum.Parse<StockVoucherType>(request.VoucherType!);
            query = query.Where(c => db.StockVoucherLines.Any(l =>
                l.ContainerId == c.Id
                && l.StockVoucher.Type == type
                && l.StockVoucher.Status == StockVoucherStatus.CONFIRMED
                && l.ClosedShortAt == null
                && l.StockVoucher.WarehouseId == request.WarehouseId));
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(c =>
                EF.Functions.ILike(c.Barcode, $"%{term}%")
                || (c.Product != null && EF.Functions.ILike(c.Product.Sku, $"%{term}%"))
                || (c.Product != null && EF.Functions.ILike(c.Product.Name, $"%{term}%"))
                || (c.SupplierPackageBarcode != null
                    && EF.Functions.ILike(c.SupplierPackageBarcode, $"%{term}%")));
        }

        var total = await query.CountAsync(cancellationToken);
        // Newest confirmed voucher first when filtering by voucher: the phiếu just made comes on top.
        var ordered = byVoucher
            ? query.OrderByDescending(c => db.StockVoucherLines
                    .Where(l => l.ContainerId == c.Id && l.StockVoucher.Status == StockVoucherStatus.CONFIRMED && l.ClosedShortAt == null)
                    .Max(l => l.StockVoucher.ConfirmedAt))
                .ThenBy(c => c.Barcode)
            : query.OrderBy(c => c.Barcode);
        var items = await ordered
            .Skip(request.Skip)
            .Take(request.Take)
            .Select(c => new ContainerListItemResponse(
                c.Id,
                c.Barcode,
                c.Status.ToString(),
                c.ProductId,
                c.Product != null ? c.Product.Sku : string.Empty,
                c.Product != null ? c.Product.Name : string.Empty,
                c.CurrentStorageLocationId,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.Code : null,
                c.CurrentStorageLocation != null ? c.CurrentStorageLocation.EndpointId : c.CurrentEndpointId,
                c.CurrentLevelNo,
                c.SupplierPackageBarcode,
                c.UpdatedAt,
                false, null, c.ContentsQuantity))
            .ToListAsync(cancellationToken);

        // The latest voucher each Container is on (cancelled ones and lines closed short do not count).
        var ids = items.Select(i => i.Id).ToList();
        var vouchers = (await db.StockVoucherLines.AsNoTracking()
                .Where(l => ids.Contains(l.ContainerId) && l.StockVoucher.Status != StockVoucherStatus.CANCELLED && l.ClosedShortAt == null)
                .Select(l => new
                {
                    l.ContainerId,
                    Voucher = new ContainerVoucherResponse(
                        l.StockVoucher.Id, l.StockVoucher.Code, l.StockVoucher.Type.ToString(), l.StockVoucher.Status.ToString(),
                        l.StockVoucher.CreatedAt, l.StockVoucher.ConfirmedAt)
                })
                .ToListAsync(cancellationToken))
            .GroupBy(x => x.ContainerId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Voucher).OrderByDescending(v => v.CreatedAt).First());
        if (vouchers.Count > 0)
        {
            items = items.Select(i => vouchers.TryGetValue(i.Id, out var v) ? i with { Voucher = v } : i).ToList();
        }

        // Transport Requests live in another module, so the flag is filled in after the query.
        var moving = await transports.GetContainersInActiveTransportAsync(items.Select(i => i.Id).ToList(), cancellationToken);
        if (moving.Count > 0)
        {
            items = items.Select(i => moving.Contains(i.Id) ? i with { InActiveTransport = true } : i).ToList();
        }

        return new ListContainersResponse(items, total);
    }
}
