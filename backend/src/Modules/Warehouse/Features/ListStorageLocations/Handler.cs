using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.ListStorageLocations;

public sealed class ListStorageLocationsHandler(WarehouseDbContext db, IMapEndpointCatalog endpointCatalog)
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

        var locations = await query
            .OrderBy(s => s.Code)
            .ToListAsync(cancellationToken);

        var warehouseName = await db.Warehouses
            .AsNoTracking()
            .Where(w => w.Id == request.WarehouseId)
            .Select(w => w.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;

        // Code and name of the Endpoint come from Navigation, which owns them.
        var endpoints = (await endpointCatalog.GetEndpointsAsync(
                locations.Select(l => l.EndpointId).Distinct().ToList(), cancellationToken))
            .ToDictionary(e => e.Id);

        var items = locations
            .Select(l => StorageLocationListItemResponse.From(l, warehouseName, endpoints.GetValueOrDefault(l.EndpointId)))
            .ToList();

        return new ListStorageLocationsResponse(items, items.Count);
    }
}
