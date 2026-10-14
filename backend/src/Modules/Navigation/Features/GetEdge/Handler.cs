using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.GetEdge;

public sealed class GetEdgeHandler(NavigationDbContext dbContext)
{
    public async Task<IReadOnlyList<EdgeResponse>> GetByMapVersionIdAsync(
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

        var edges = await dbContext.Edges
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .OrderBy(e => e.Code)
            .ToListAsync(cancellationToken);

        return edges.Select(EdgeResponse.From).ToList();
    }

    public async Task<EdgeResponse> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var edge = await dbContext.Edges
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (edge is null)
        {
            throw new NotFoundException($"Edge with ID '{id}' was not found.", "edge_not_found");
        }

        return EdgeResponse.From(edge);
    }
}
