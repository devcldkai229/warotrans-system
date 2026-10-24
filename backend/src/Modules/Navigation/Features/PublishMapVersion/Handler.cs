using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Navigation.Features.PublishMapVersion;

public sealed class PublishMapVersionHandler(
    NavigationDbContext dbContext,
    IStorageLocationEndpointRebinder storageLocations,
    ILogger<PublishMapVersionHandler> logger)
{
    /// <summary>Longest clone-of-a-clone chain followed when re-binding storage locations.</summary>
    private const int MaxCloneDepth = 32;

    public async Task<MapVersionResponse> HandleAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var mapVersion = await dbContext.MapVersions
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (mapVersion is null)
        {
            throw new NotFoundException($"MapVersion with ID '{id}' was not found.", "map_version_not_found");
        }

        if (mapVersion.Status == MapStatus.PUBLISHED)
        {
            throw new DomainValidationException(
                $"MapVersion with ID '{id}' is already PUBLISHED.",
                "map_already_published");
        }

        if (mapVersion.Status == MapStatus.ARCHIVED)
        {
            throw new DomainValidationException(
                $"MapVersion with ID '{id}' is ARCHIVED and cannot be published directly.",
                "cannot_publish_archived_map");
        }

        if (PendingMapAssetUris.IsPending(mapVersion.MapUri))
        {
            throw new DomainValidationException(
                "Cannot publish a map without occupancy assets. Import yaml + pgm first.",
                "map_assets_pending");
        }

        var currentlyPublishedMaps = await dbContext.MapVersions
            .Where(m => m.WarehouseId == mapVersion.WarehouseId && m.Status == MapStatus.PUBLISHED && m.Id != id)
            .ToListAsync(cancellationToken);

        foreach (var published in currentlyPublishedMaps)
        {
            published.Status = MapStatus.ARCHIVED;
        }

        var now = DateTimeOffset.UtcNow;
        mapVersion.Status = MapStatus.PUBLISHED;
        mapVersion.PublishedAt = now;

        await dbContext.SaveChangesAsync(cancellationToken);

        // A cloned map gave its endpoints new ids: storage locations bound to the source endpoints follow them.
        var endpointMap = await SourceEndpointMapAsync(mapVersion.Id, cancellationToken);
        if (endpointMap.Count > 0)
        {
            var rebound = await storageLocations.RebindAsync(mapVersion.WarehouseId, endpointMap, cancellationToken);
            logger.LogInformation(
                "Map {MapCode} published: {Rebound} storage location(s) moved to its cloned endpoints",
                mapVersion.Code,
                rebound);
        }

        return MapVersionResponse.From(mapVersion);
    }

    /// <summary>
    /// Every ancestor endpoint (source, source of source, … across clones) → the endpoint of this map that
    /// descends from it. Endpoints added in the DRAFT have no source and map nothing.
    /// </summary>
    private async Task<Dictionary<Guid, Guid>> SourceEndpointMapAsync(Guid mapVersionId, CancellationToken cancellationToken)
    {
        var frontier = await dbContext.Endpoints.AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId && e.SourceEndpointId != null)
            .ToDictionaryAsync(e => e.SourceEndpointId!.Value, e => e.Id, cancellationToken);
        var map = new Dictionary<Guid, Guid>(frontier);

        for (var depth = 0; depth < MaxCloneDepth && frontier.Count > 0; depth++)
        {
            var ids = frontier.Keys.ToList();
            var parents = await dbContext.Endpoints.AsNoTracking()
                .Where(e => ids.Contains(e.Id) && e.SourceEndpointId != null)
                .Select(e => new { e.Id, Source = e.SourceEndpointId!.Value })
                .ToListAsync(cancellationToken);

            var next = new Dictionary<Guid, Guid>();
            foreach (var parent in parents.Where(p => !map.ContainsKey(p.Source)))
            {
                map[parent.Source] = frontier[parent.Id];
                next[parent.Source] = frontier[parent.Id];
            }

            frontier = next;
        }

        return map;
    }
}
