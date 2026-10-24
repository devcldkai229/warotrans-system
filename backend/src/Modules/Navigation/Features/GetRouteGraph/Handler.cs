using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Geometry;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.RouteGraph;

namespace WaroTrans.Navigation.Features.GetRouteGraph;

/// <summary>Builds the Nav2 Route Server graph of a map version from its Edges, Endpoints and Zones (generated per call, not stored).</summary>
public sealed class GetRouteGraphHandler(NavigationDbContext dbContext)
{
    public async Task<RouteGraphResult> HandleAsync(Guid mapVersionId, CancellationToken cancellationToken = default)
    {
        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == mapVersionId)
            .Select(m => new { m.Code, m.FrameId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"MapVersion with ID '{mapVersionId}' was not found.", "map_version_not_found");

        var edges = await dbContext.Edges
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .ToListAsync(cancellationToken);

        var endpoints = await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .Select(e => new RouteGraphEndpointInput(e.Code, e.X, e.Y, e.IsEnabled))
            .ToListAsync(cancellationToken);

        var edgeInputs = edges
            .Select(e => new RouteGraphEdgeInput(
                e.Code,
                GeoJsonGeometry.ParseLineStringCoordinates(e.Geometry.RootElement)
                    .Select(p => new RoutePoint(p[0], p[1]))
                    .ToList(),
                e.Direction,
                e.MaxSpeed,
                e.IsActive))
            .ToList();

        var zones = (await dbContext.Zones
                .AsNoTracking()
                .Where(z => z.MapVersionId == mapVersionId)
                .ToListAsync(cancellationToken))
            .Select(z => new RouteGraphZoneInput(
                z.Code,
                z.ZoneType,
                GeoJsonGeometry.ParsePolygonRing(z.Geometry.RootElement)
                    .Select(p => new RoutePoint(p[0], p[1]))
                    .ToList(),
                z.MaxSpeed,
                z.IsActive))
            .ToList();

        var frame = string.IsNullOrWhiteSpace(mapVersion.FrameId) ? "map" : mapVersion.FrameId;
        return RouteGraphBuilder.Build(new RouteGraphInput(mapVersion.Code, frame, edgeInputs, endpoints, zones));
    }
}
