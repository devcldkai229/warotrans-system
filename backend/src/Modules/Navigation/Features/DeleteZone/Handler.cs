using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.DeleteZone;

public sealed class DeleteZoneHandler(NavigationDbContext dbContext)
{
    public async Task HandleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var zone = await dbContext.Zones.FirstOrDefaultAsync(z => z.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Zone with ID '{id}' was not found.", "zone_not_found");

        var mapStatus = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == zone.MapVersionId)
            .Select(m => (MapStatus?)m.Status)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(
                $"MapVersion with ID '{zone.MapVersionId}' was not found.",
                "map_version_not_found");

        if (mapStatus != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Zones can only be deleted on DRAFT map versions (current status: {mapStatus}).",
                "map_version_not_draft");
        }

        dbContext.Zones.Remove(zone);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
