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
    EndpointStorage endpointStorage,
    ILogger<PublishMapVersionHandler> logger,
    MapPublishCheck? publishCheck = null)
{
    /// <summary>Longest clone-of-a-clone chain followed when re-binding storage locations.</summary>
    private const int MaxCloneDepth = 32;

    /// <param name="force">Publish over overridable BLOCKs of the publish check (with <paramref name="reason"/>).</param>
    public async Task<MapVersionResponse> HandleAsync(
        Guid id,
        CancellationToken cancellationToken = default,
        bool force = false,
        string? reason = null)
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

        // Endpoints marked as storage locations get them once published: refuse now rather than publish without them.
        var takenCodes = await endpointStorage.TakenMarkedCodesAsync(mapVersion, cancellationToken);
        if (takenCodes.Count > 0)
        {
            throw new ConflictException(
                $"Storage location code(s) '{string.Join(", ", takenCodes)}' already used in this warehouse. "
                + "Change them on the endpoints before publishing.",
                "storage_location_code_used");
        }

        // Workflows, running Jobs, waiting requests, robots (IMapPublishGuard): refused here, not broken after.
        WaroTrans.Navigation.Contracts.MapPublishContext? publishContext = null;
        if (publishCheck is not null)
        {
            await publishCheck.EnsurePublishableAsync(id, force, reason, cancellationToken);
            publishContext = (await publishCheck.ContextAsync(id, cancellationToken)).Context;
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

        var created = await endpointStorage.CreateMarkedAsync(mapVersion, cancellationToken);
        if (created > 0)
        {
            logger.LogInformation(
                "Map {MapCode} published: {Created} storage location(s) created for its marked endpoints",
                mapVersion.Code,
                created);
        }

        if (publishCheck is not null && publishContext is not null)
        {
            // Requests and Jobs that were waiting on the replaced map move to this one (IMapPublishFollower).
            await publishCheck.FollowAsync(publishContext, cancellationToken);
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
