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
            .Select(e => new EndpointSnapshot(e.Id, e.MapVersionId, e.Code, e.Name, e.EndpointType, e.IsEnabled))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<EndpointPoseWithType>> GetEndpointsOnMapAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
        await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .Select(e => new EndpointPoseWithType(e.Id, e.Code, e.Name, e.EndpointType, e.IsEnabled, e.X, e.Y, e.PositionTolerance))
            .ToListAsync(cancellationToken);

    public Task<EndpointPoseSnapshot?> GetEndpointPoseByCodeAsync(
        Guid mapVersionId, string code, CancellationToken cancellationToken = default) =>
        dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId && e.Code == code)
            .Select(e => new EndpointPoseSnapshot(e.Id, e.MapVersionId, e.Code, e.X, e.Y, e.Yaw, e.IsEnabled, e.PositionTolerance))
            .FirstOrDefaultAsync(cancellationToken);

    public Task<EndpointPoseSnapshot?> GetEndpointPoseAsync(Guid endpointId, CancellationToken cancellationToken = default) =>
        dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.Id == endpointId)
            .Select(e => new EndpointPoseSnapshot(e.Id, e.MapVersionId, e.Code, e.X, e.Y, e.Yaw, e.IsEnabled, e.PositionTolerance))
            .FirstOrDefaultAsync(cancellationToken);
}
