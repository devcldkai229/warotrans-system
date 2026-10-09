using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetMapVersion;

public sealed class GetMapVersionHandler(NavigationDbContext dbContext)
{
    public async Task<IReadOnlyList<MapVersionResponse>> GetByWarehouseIdAsync(
        Guid warehouseId,
        CancellationToken cancellationToken = default)
    {
        return await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.WarehouseId == warehouseId)
            .OrderByDescending(m => m.VersionNo)
            .Select(m => new MapVersionResponse(
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
            .ToListAsync(cancellationToken);
    }

    public async Task<MapVersionResponse> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == id)
            .Select(m => new MapVersionResponse(
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

        if (mapVersion is null)
        {
            throw new NotFoundException($"MapVersion with ID '{id}' was not found.", "map_version_not_found");
        }

        return mapVersion;
    }
}
