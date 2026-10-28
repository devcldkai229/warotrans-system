using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Geometry;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Services;

namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// Loads map geometry from the database, optionally occupancy PGM from the asset store,
/// compiles (and caches when PUBLISHED) a <see cref="CompiledTrafficGraph"/>.
/// </summary>
public sealed class TrafficGraphCompileService(
    NavigationDbContext dbContext,
    CompiledTrafficGraphCache cache,
    IMapAssetStore mapAssetStore,
    IOptions<TrafficFootprintOptions> footprintOptions)
{
    /// <summary>
    /// Compile settings shared by every runtime consumer of the graph — the exported route graph the robot loads,
    /// host-start reconciliation and Active MOVE planning. They must match: the occupancy grid is part of the graph
    /// hash, so a mismatch makes the robot reject every grant (ROUTE_GRAPH_MISMATCH).
    /// </summary>
    public const bool RuntimeIncludesOccupancy = false;

    public async Task<TrafficCompileBundle> CompileAsync(
        Guid mapVersionId,
        bool includeOccupancy = true,
        CancellationToken cancellationToken = default)
    {
        var map = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == mapVersionId, cancellationToken)
            ?? throw new NotFoundException($"MapVersion with ID '{mapVersionId}' was not found.", "map_version_not_found");

        var edges = await dbContext.Edges
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .ToListAsync(cancellationToken);

        var endpoints = await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .ToListAsync(cancellationToken);

        var zones = await dbContext.Zones
            .AsNoTracking()
            .Where(z => z.MapVersionId == mapVersionId)
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

        var endpointInputs = endpoints
            .Select(e => new RouteGraphEndpointInput(e.Code, e.X, e.Y, e.IsEnabled))
            .ToList();

        var zoneInputs = zones
            .Select(z => new RouteGraphZoneInput(
                z.Code,
                z.ZoneType,
                GeoJsonGeometry.ParsePolygonRing(z.Geometry.RootElement)
                    .Select(p => new RoutePoint(p[0], p[1]))
                    .ToList(),
                z.MaxSpeed,
                z.IsActive))
            .ToList();

        var laneMeta = edges
            .Select(e => new TrafficLaneMeta(e.Code, e.WidthMeters, e.Capacity, e.Direction))
            .ToList();
        var zoneMeta = zones
            .Select(z => new TrafficZoneMeta(z.Code, z.ZoneType, z.Capacity))
            .ToList();

        var footprint = footprintOptions.Value;
        var frame = string.IsNullOrWhiteSpace(map.FrameId) ? "map" : map.FrameId;

        OccupancyGrid? occupancy = null;
        if (includeOccupancy)
        {
            occupancy = await TryLoadOccupancyAsync(map, cancellationToken);
        }

        var recoveryStops = endpoints
            .Where(e => e.IsEnabled && e.EndpointType == EndpointType.PARK)
            .Select(e => e.Code)
            .ToHashSet(StringComparer.Ordinal);

        var input = new TrafficCompileInput(
            map.Code,
            frame,
            edgeInputs,
            endpointInputs,
            zoneInputs,
            laneMeta,
            zoneMeta,
            footprint,
            occupancy,
            ServiceStopEndpointCodes: null,
            RecoveryEndpointCodes: recoveryStops);

        var hash = TrafficGraphCompiler.ComputeGraphHash(input);
        if (map.Status == MapStatus.PUBLISHED &&
            cache.TryGet(mapVersionId, hash, out var cached) &&
            cached is not null)
        {
            return new TrafficCompileBundle(
                new TrafficCompileResult(cached, cached.CompileIssues),
                occupancy,
                zoneInputs,
                zoneMeta,
                map.Status);
        }

        var compiled = TrafficGraphCompiler.Compile(input);
        cache.SetPublished(mapVersionId, map.Status, compiled.Graph);
        return new TrafficCompileBundle(compiled, occupancy, zoneInputs, zoneMeta, map.Status);
    }

    private async Task<OccupancyGrid?> TryLoadOccupancyAsync(Entities.MapVersion map, CancellationToken cancellationToken)
    {
        if (PendingMapAssetUris.IsPending(map.MapUri) || map.Resolution <= 0)
        {
            return null;
        }

        try
        {
            var bytes = await mapAssetStore.TryReadMapPgmAsync(map.MapUri, map.WarehouseId, map.Id, cancellationToken);
            if (bytes is null || bytes.Length == 0)
            {
                return null;
            }

            return OccupancyGrid.Load(
                bytes,
                map.Resolution,
                map.OriginX,
                map.OriginY,
                map.Negate,
                map.OccupiedThreshold,
                map.FreeThreshold);
        }
        catch
        {
            return null;
        }
    }
}

public sealed record TrafficCompileBundle(
    TrafficCompileResult Result,
    OccupancyGrid? Occupancy,
    IReadOnlyList<RouteGraphZoneInput> Zones,
    IReadOnlyList<TrafficZoneMeta> ZoneMeta,
    MapStatus Status);
