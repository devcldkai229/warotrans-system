using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Navigation.Features.DeleteRouteGraphCache;

/// <summary>
/// Drops the in-memory compiled traffic graph for a map. Geometry is unchanged;
/// the next route-graph / traffic compile rebuilds from Edges / Endpoints / Zones.
/// </summary>
public sealed class DeleteRouteGraphCacheHandler(
    NavigationDbContext dbContext,
    CompiledTrafficGraphCache cache)
{
    public async Task HandleAsync(Guid mapVersionId, CancellationToken cancellationToken = default)
    {
        var exists = await dbContext.MapVersions
            .AsNoTracking()
            .AnyAsync(m => m.Id == mapVersionId, cancellationToken);

        if (!exists)
        {
            throw new NotFoundException(
                $"MapVersion with ID '{mapVersionId}' was not found.",
                "map_version_not_found");
        }

        cache.Remove(mapVersionId);
    }
}
