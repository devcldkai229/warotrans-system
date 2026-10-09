using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetEndpoint;

public sealed class GetEndpointHandler(NavigationDbContext dbContext)
{
    public async Task<IReadOnlyList<EndpointResponse>> GetByMapVersionIdAsync(
        Guid mapVersionId,
        CancellationToken cancellationToken = default)
    {
        var mapExists = await dbContext.MapVersions
            .AsNoTracking()
            .AnyAsync(m => m.Id == mapVersionId, cancellationToken);

        if (!mapExists)
        {
            throw new NotFoundException($"MapVersion with ID '{mapVersionId}' was not found.", "map_version_not_found");
        }

        return await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .OrderBy(e => e.Code)
            .Select(e => new EndpointResponse(
                e.Id,
                e.MapVersionId,
                e.Code,
                e.Name,
                e.EndpointType.ToString(),
                e.X,
                e.Y,
                e.Yaw,
                e.PositionTolerance,
                e.YawTolerance,
                e.IsEnabled))
            .ToListAsync(cancellationToken);
    }

    public async Task<EndpointResponse> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var endpoint = await dbContext.Endpoints
            .AsNoTracking()
            .Where(e => e.Id == id)
            .Select(e => new EndpointResponse(
                e.Id,
                e.MapVersionId,
                e.Code,
                e.Name,
                e.EndpointType.ToString(),
                e.X,
                e.Y,
                e.Yaw,
                e.PositionTolerance,
                e.YawTolerance,
                e.IsEnabled))
            .FirstOrDefaultAsync(cancellationToken);

        if (endpoint is null)
        {
            throw new NotFoundException($"Endpoint with ID '{id}' was not found.", "endpoint_not_found");
        }

        return endpoint;
    }
}
