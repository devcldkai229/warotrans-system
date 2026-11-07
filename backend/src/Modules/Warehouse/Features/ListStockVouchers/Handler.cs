using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListStockVouchers;

public sealed class ListStockVouchersHandler(WarehouseDbContext db)
{
    public async Task<ListStockVouchersResponse> HandleAsync(
        ListStockVouchersRequest request,
        CancellationToken cancellationToken)
    {
        var query = db.StockVouchers
            .AsNoTracking()
            .Where(v => v.WarehouseId == request.WarehouseId);

        if (request.Type is { } type)
        {
            query = query.Where(v => v.Type == type);
        }

        if (request.Status is { } status)
        {
            query = query.Where(v => v.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim();
            query = query.Where(v =>
                EF.Functions.ILike(v.Code, $"%{term}%")
                || (v.ReferenceNo != null && EF.Functions.ILike(v.ReferenceNo, $"%{term}%")));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(v => v.CreatedAt)
            .Skip(request.Skip)
            .Take(request.Take)
            .Select(v => new StockVoucherListItemResponse(
                v.Id,
                v.Code,
                v.Type.ToString(),
                v.Status.ToString(),
                v.ReferenceNo,
                v.Note,
                v.CreatedBy,
                v.CreatedAt,
                v.ConfirmedAt,
                v.UpdatedAt,
                v.Lines.Count,
                // Same rule as StockVoucherProgress.IsDone, written out so it runs in SQL.
                v.Type == StockVoucherType.INBOUND
                    ? v.Lines.Count(l => l.Container!.Status == ContainerStatus.STORED || l.Container.Status == ContainerStatus.ISSUED)
                    : v.Lines.Count(l => l.Container!.Status == ContainerStatus.ISSUED)))
            .ToListAsync(cancellationToken);

        return new ListStockVouchersResponse(items, total);
    }
}
