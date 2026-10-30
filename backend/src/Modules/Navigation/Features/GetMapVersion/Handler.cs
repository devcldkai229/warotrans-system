using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetMapVersion;

public sealed class GetMapVersionHandler(NavigationDbContext dbContext)
{
    public async Task<IReadOnlyList<MapVersionResponse>> GetByWarehouseIdAsync(
        Guid warehouseId,
        CancellationToken cancellationToken = default)
    {
        var items = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.WarehouseId == warehouseId)
            .OrderByDescending(m => m.VersionNo)
            .ToListAsync(cancellationToken);

        return items.Select(MapVersionResponse.From).ToList();
    }

    public async Task<MapVersionResponse> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (mapVersion is null)
        {
            throw new NotFoundException($"MapVersion with ID '{id}' was not found.", "map_version_not_found");
        }

        return MapVersionResponse.From(mapVersion);
    }

    public async Task<MapVersionDetailResponse> GetDetailByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken)
            ?? throw new NotFoundException($"MapVersion with ID '{id}' was not found.", "map_version_not_found");

        var endpoints = await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.MapVersionId == id)
            .OrderBy(e => e.Code)
            .Select(e => new EndpointListItemDto(
                e.Id,
                e.MapVersionId,
                e.Code,
                e.Name,
                e.EndpointType.ToString(),
                e.X,
                e.Y,
                e.Yaw,
                e.PositionTolerance,
                e.YawTolerance,
                e.IsEnabled))
            .ToListAsync(cancellationToken);

        var edges = await dbContext.Edges
            .AsNoTracking()
            .Where(e => e.MapVersionId == id)
            .OrderBy(e => e.Code)
            .ToListAsync(cancellationToken);

        var zones = await dbContext.Zones
            .AsNoTracking()
            .Where(z => z.MapVersionId == id)
            .OrderBy(z => z.Code)
            .ToListAsync(cancellationToken);

        var sourceCode = mapVersion.SourceMapVersionId is { } sourceId
            ? await dbContext.MapVersions.AsNoTracking()
                .Where(m => m.Id == sourceId)
                .Select(m => m.Code)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        return new MapVersionDetailResponse(
            mapVersion.Id,
            mapVersion.WarehouseId,
            mapVersion.Code,
            mapVersion.VersionNo,
            mapVersion.Name,
            mapVersion.Status.ToString(),
            mapVersion.MapUri,
            mapVersion.MapYamlUri,
            mapVersion.PreviewImageUri,
            mapVersion.FrameId,
            mapVersion.ImageWidthPixels,
            mapVersion.ImageHeightPixels,
            mapVersion.Resolution,
            mapVersion.OriginX,
            mapVersion.OriginY,
            mapVersion.OriginYaw,
            mapVersion.Negate,
            mapVersion.OccupiedThreshold,
            mapVersion.FreeThreshold,
            mapVersion.ContentHash,
            mapVersion.CreatedAt,
            mapVersion.PublishedAt,
            endpoints,
            edges.Select(e => new EdgeListItemDto(
                e.Id,
                e.MapVersionId,
                e.Code,
                e.Name,
                e.Geometry.RootElement.Clone(),
                e.WidthMeters,
                e.Direction.ToString(),
                e.MaxSpeed,
                e.IsActive)).ToList(),
            zones.Select(z => new ZoneListItemDto(
                z.Id,
                z.MapVersionId,
                z.Code,
                z.Name,
                z.ZoneType.ToString(),
                z.Geometry.RootElement.Clone(),
                z.MaxSpeed,
                z.IsActive,
                z.Policy?.RootElement.Clone(),
                z.PolicySchemaVersion)).ToList(),
            mapVersion.SourceMapVersionId,
            sourceCode);
    }
}
