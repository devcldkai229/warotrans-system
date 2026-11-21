using Microsoft.EntityFrameworkCore;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Services;

public sealed class NavigationModuleApi(NavigationDbContext dbContext) : INavigationModule
{
    public Task<MapVersionSnapshot?> GetMapVersionAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
        dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == mapVersionId)
            .Select(m => new MapVersionSnapshot(m.Id, m.WarehouseId, m.VersionNo, m.Status, m.Code))
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<MapVersionSnapshot>> GetPublishedMapsAsync(CancellationToken cancellationToken = default) =>
        await dbContext.MapVersions.AsNoTracking()
            .Where(map => map.Status == MapStatus.PUBLISHED)
            .OrderByDescending(map => map.PublishedAt.HasValue)
            .ThenByDescending(map => map.PublishedAt)
            .ThenByDescending(map => map.CreatedAt)
            .ThenByDescending(map => map.VersionNo)
            .ThenBy(map => map.Id)
            .Select(map => new MapVersionSnapshot(map.Id, map.WarehouseId, map.VersionNo, map.Status, map.Code))
            .ToListAsync(cancellationToken);

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

    public async Task<EndpointGroupSnapshot?> GetEndpointGroupAsync(Guid groupId, CancellationToken cancellationToken = default)
    {
        var group = await dbContext.EndpointGroups.AsNoTracking().FirstOrDefaultAsync(g => g.Id == groupId, cancellationToken);
        if (group is null)
        {
            return null;
        }

        var members = await dbContext.EndpointGroupMembers.AsNoTracking()
            .Where(m => m.EndpointGroupId == groupId)
            .Join(dbContext.Endpoints.AsNoTracking(), m => m.EndpointId, e => e.Id, (_, e) => e)
            .OrderBy(e => e.Code)
            .Select(e => new EndpointPoseWithType(e.Id, e.Code, e.Name, e.EndpointType, e.IsEnabled, e.X, e.Y, e.PositionTolerance))
            .ToListAsync(cancellationToken);
        return new EndpointGroupSnapshot(group.Id, group.MapVersionId, group.Code, group.Name, group.SelectionPolicy, group.IsActive, members);
    }
}
