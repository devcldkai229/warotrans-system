using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListWarehouses;

public sealed class ListWarehousesHandler(WarehouseDbContext db)
{
    public async Task<ListWarehousesResponse> HandleAsync(
        ListWarehousesRequest request,
        CancellationToken cancellationToken)
    {
        var query = db.Warehouses.AsNoTracking().AsQueryable();

        if (request.IsActive is { } isActive)
        {
            query = query.Where(w => w.IsActive == isActive);
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(w => w.Code)
            .Skip(request.Skip)
            .Take(request.Take)
            .Select(w => new WarehouseListItemResponse(
                w.Id,
                w.Code,
                w.Name,
                w.Address,
                w.Timezone,
                w.IsActive,
                w.CreatedAt))
            .ToListAsync(cancellationToken);

        return new ListWarehousesResponse(items, total);
    }
}
