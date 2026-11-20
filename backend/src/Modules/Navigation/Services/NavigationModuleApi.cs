using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Geometry;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Services;

public sealed class NavigationModuleApi(NavigationDbContext dbContext) : INavigationModule, IWarehouseMapLocations
{
    // Same convention as the operational area filter in the mobile and web map.
    private const string WorkZonePrefix = "ZONE-AREA-%";
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

    public Task<WorkZoneSnapshot?> GetWorkZoneAsync(Guid zoneId, CancellationToken cancellationToken = default) =>
        dbContext.Zones.AsNoTracking()
            .Where(zone => zone.Id == zoneId && zone.IsActive && EF.Functions.ILike(zone.Code, WorkZonePrefix))
            .Select(zone => new WorkZoneSnapshot(zone.Id, zone.MapVersionId, zone.Code))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<string>> GetWorkZoneCodesAtEndpointAsync(Guid endpointId, CancellationToken cancellationToken = default)
    {
        var endpoint = await GetEndpointPoseAsync(endpointId, cancellationToken);
        if (endpoint is not { IsEnabled: true }) return [];
        var zones = await dbContext.Zones.AsNoTracking()
            .Where(zone => zone.MapVersionId == endpoint.MapVersionId && zone.IsActive && EF.Functions.ILike(zone.Code, WorkZonePrefix))
            .Select(zone => new { zone.Code, zone.Geometry })
            .ToListAsync(cancellationToken);
        return zones.Where(zone => GeoJsonGeometry.ContainsPoint(zone.Geometry.RootElement, endpoint.X, endpoint.Y))
            .Select(zone => zone.Code.ToUpperInvariant()).ToList();
    }

    public async Task<WarehouseMapLocation?> FindPublishedLocationAsync(
        Guid mapVersionId, Guid? edgeId, Guid? zoneId, Guid? endpointId, CancellationToken cancellationToken)
    {
        var map = await GetMapVersionAsync(mapVersionId, cancellationToken);
        if (map is not { Status: MapStatus.PUBLISHED }) return null;

        string? code;
        if (edgeId is { } edge)
            code = await dbContext.Edges.AsNoTracking()
                .Where(item => item.Id == edge && item.MapVersionId == mapVersionId && item.IsActive)
                .Select(item => item.Code).SingleOrDefaultAsync(cancellationToken);
        else if (zoneId is { } zone)
            code = await dbContext.Zones.AsNoTracking()
                .Where(item => item.Id == zone && item.MapVersionId == mapVersionId && item.IsActive)
                .Select(item => item.Code).SingleOrDefaultAsync(cancellationToken);
        else
            code = await dbContext.Endpoints.AsNoTracking()
                .Where(item => item.Id == endpointId && item.MapVersionId == mapVersionId && item.IsEnabled)
                .Select(item => item.Code).SingleOrDefaultAsync(cancellationToken);

        return code is null ? null : new(map.WarehouseId, code);
    }
}
