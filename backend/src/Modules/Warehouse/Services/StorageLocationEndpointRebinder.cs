using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Services;

public sealed class StorageLocationEndpointRebinder(WarehouseDbContext dbContext) : IStorageLocationEndpointRebinder
{
    public async Task<int> RebindAsync(
        Guid warehouseId,
        IReadOnlyDictionary<Guid, Guid> endpointMap,
        CancellationToken cancellationToken = default)
    {
        if (endpointMap.Count == 0)
        {
            return 0;
        }

        var oldIds = endpointMap.Keys.ToList();
        var locations = await dbContext.StorageLocations
            .Where(l => l.WarehouseId == warehouseId && oldIds.Contains(l.EndpointId))
            .ToListAsync(cancellationToken);
        foreach (var location in locations)
        {
            location.EndpointId = endpointMap[location.EndpointId];
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return locations.Count;
    }
}
