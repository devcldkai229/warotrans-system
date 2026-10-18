using Microsoft.EntityFrameworkCore;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Navigation.Services;

/// <summary>Navigation's answer to the contract Warehouse defines for StorageLocation endpoints.</summary>
public sealed class MapEndpointCatalog(NavigationDbContext dbContext) : IMapEndpointCatalog
{
    public async Task<IReadOnlyList<MapEndpointSnapshot>> GetPublishedEndpointsAsync(
        Guid warehouseId,
        CancellationToken cancellationToken = default) =>
        await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => dbContext.MapVersions.Any(m =>
                m.Id == e.MapVersionId && m.WarehouseId == warehouseId && m.Status == MapStatus.PUBLISHED))
            .OrderBy(e => e.Name)
            .Select(e => new MapEndpointSnapshot(e.Id, e.MapVersionId, e.Code, e.Name, e.EndpointType.ToString(), e.IsEnabled))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<MapEndpointSnapshot>> GetEndpointsAsync(
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default)
    {
        if (endpointIds.Count == 0)
        {
            return [];
        }

        return await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => endpointIds.Contains(e.Id))
            .Select(e => new MapEndpointSnapshot(e.Id, e.MapVersionId, e.Code, e.Name, e.EndpointType.ToString(), e.IsEnabled))
            .ToListAsync(cancellationToken);
    }
}
