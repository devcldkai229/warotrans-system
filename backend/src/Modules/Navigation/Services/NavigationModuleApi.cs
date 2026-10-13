using Microsoft.EntityFrameworkCore;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Services;

public sealed class NavigationModuleApi(NavigationDbContext dbContext) : INavigationModule
{
    public Task<MapVersionSnapshot?> GetMapVersionAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
        dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == mapVersionId)
            .Select(m => new MapVersionSnapshot(m.Id, m.WarehouseId, m.VersionNo, m.Status))
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<EndpointSnapshot>> GetEndpointsAsync(
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
            .Select(e => new EndpointSnapshot(e.Id, e.MapVersionId, e.Code, e.EndpointType, e.IsEnabled))
            .ToListAsync(cancellationToken);
    }
}
