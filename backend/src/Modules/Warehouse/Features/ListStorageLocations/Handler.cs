using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListStorageLocations;

public sealed class ListStorageLocationsHandler(WarehouseDbContext db)
{
    public async Task<ListStorageLocationsResponse> HandleAsync(
        ListStorageLocationsRequest request,
        CancellationToken cancellationToken)
    {
        var query = db.StorageLocations
            .AsNoTracking()
            .Where(s => s.WarehouseId == request.WarehouseId);

        if (request.ActiveOnly)
        {
            query = query.Where(s => s.IsActive);
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(s => s.Code)
            .Select(s => new StorageLocationListItemResponse(
                s.Id,
                s.WarehouseId,
                s.EndpointId,
                s.Code,
                s.Name,
                s.IsActive))
            .ToListAsync(cancellationToken);

        return new ListStorageLocationsResponse(items, total);
    }
}
