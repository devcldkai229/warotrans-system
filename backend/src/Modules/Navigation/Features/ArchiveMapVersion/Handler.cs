using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.ArchiveMapVersion;

public sealed class ArchiveMapVersionHandler(NavigationDbContext dbContext)
{
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

        if (mapVersion.Status == MapStatus.ARCHIVED)
        {
            throw new DomainValidationException(
                $"MapVersion with ID '{id}' is already ARCHIVED.",
                "map_already_archived");
        }

        mapVersion.Status = MapStatus.ARCHIVED;

        await dbContext.SaveChangesAsync(cancellationToken);

        return MapVersionResponse.From(mapVersion);
    }
}
