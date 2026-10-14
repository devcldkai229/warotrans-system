using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetZone;

public sealed class GetZoneHandler(NavigationDbContext dbContext)
{
    public async Task<ZoneResponse> HandleByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var zone = await dbContext.Zones.AsNoTracking()
            .FirstOrDefaultAsync(z => z.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Zone with ID '{id}' was not found.", "zone_not_found");

        return ZoneResponse.From(zone);
    }

    public async Task<IReadOnlyList<ZoneResponse>> HandleByMapAsync(
        Guid mapVersionId,
        CancellationToken cancellationToken = default)
    {
        var exists = await dbContext.MapVersions.AsNoTracking()
            .AnyAsync(m => m.Id == mapVersionId, cancellationToken);
        if (!exists)
        {
            throw new NotFoundException(
                $"MapVersion with ID '{mapVersionId}' was not found.",
                "map_version_not_found");
        }

        var zones = await dbContext.Zones.AsNoTracking()
            .Where(z => z.MapVersionId == mapVersionId)
            .OrderBy(z => z.Code)
            .ToListAsync(cancellationToken);

        return zones.Select(ZoneResponse.From).ToList();
    }
}
