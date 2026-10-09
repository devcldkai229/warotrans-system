using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetActiveMapVersion;

public sealed class GetActiveMapVersionHandler(NavigationDbContext dbContext)
{
    public async Task<ActiveMapVersionResponse> HandleAsync(
        Guid warehouseId,
        CancellationToken cancellationToken = default)
    {
        var activeMap = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.WarehouseId == warehouseId && m.Status == MapStatus.PUBLISHED)
            .Select(m => new ActiveMapVersionResponse(
                m.Id,
                m.WarehouseId,
                m.VersionNo,
                m.Name,
                m.Status.ToString(),
                m.MapUri,
                m.Resolution,
                m.OriginX,
                m.OriginY,
                m.OriginYaw,
                m.CreatedAt,
                m.PublishedAt))
            .FirstOrDefaultAsync(cancellationToken);

        if (activeMap is null)
        {
            throw new NotFoundException(
                $"No published active map version was found for warehouse '{warehouseId}'.",
                "active_map_not_found");
        }

        return activeMap;
    }
}
