using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.PublishMapVersion;

public sealed class PublishMapVersionHandler(NavigationDbContext dbContext)
{
    public async Task<PublishMapVersionResponse> HandleAsync(
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

        // Archive any currently PUBLISHED map version for this warehouse to guarantee single active map invariant
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

        return new PublishMapVersionResponse(
            mapVersion.Id,
            mapVersion.WarehouseId,
            mapVersion.VersionNo,
            mapVersion.Name,
            mapVersion.Status.ToString(),
            mapVersion.MapUri,
            mapVersion.Resolution,
            mapVersion.OriginX,
            mapVersion.OriginY,
            mapVersion.OriginYaw,
            mapVersion.CreatedAt,
            mapVersion.PublishedAt);
    }
}
