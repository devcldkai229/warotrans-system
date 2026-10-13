using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Entities;
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

        // Geometry is jsonb, so it is mapped in memory after loading.
        var edges = await dbContext.Edges
            .AsNoTracking()
            .Where(e => e.MapVersionId == mapVersionId)
            .OrderBy(e => e.Code)
            .ToListAsync(cancellationToken);

        return edges.Select(ToResponse).ToList();
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

        return ToResponse(edge);
    }

    private static EdgeResponse ToResponse(Edge edge) =>
        new(
            edge.Id,
            edge.MapVersionId,
            edge.Code,
            new EdgeGeometryResponse(edge.Geometry.RootElement
                .GetProperty("points")
                .EnumerateArray()
                .Select(p => new EdgePointResponse(p.GetProperty("x").GetDouble(), p.GetProperty("y").GetDouble()))
                .ToList()),
            edge.Direction.ToString(),
            edge.Capacity,
            edge.MaxSpeed,
            edge.IsActive);
}
