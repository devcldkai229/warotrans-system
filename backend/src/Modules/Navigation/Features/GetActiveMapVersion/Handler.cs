using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetActiveMapVersion;

public sealed class GetActiveMapVersionHandler(NavigationDbContext dbContext)
{
    public async Task<MapVersionResponse> HandleAsync(
        Guid warehouseId,
        CancellationToken cancellationToken = default)
    {
        var activeMap = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.WarehouseId == warehouseId && m.Status == MapStatus.PUBLISHED, cancellationToken);

        if (activeMap is null)
        {
            throw new NotFoundException(
                $"No published active map version was found for warehouse '{warehouseId}'.",
                "active_map_not_found");
        }

        return MapVersionResponse.From(activeMap);
    }
}
