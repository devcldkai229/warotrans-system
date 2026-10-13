using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.DeleteEdge;

public sealed class DeleteEdgeHandler(NavigationDbContext dbContext)
{
    public async Task HandleAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var edge = await dbContext.Edges
            .FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (edge is null)
        {
            throw new NotFoundException($"Edge with ID '{id}' was not found.", "edge_not_found");
        }

        var mapStatus = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == edge.MapVersionId)
            .Select(m => (MapStatus?)m.Status)
            .FirstOrDefaultAsync(cancellationToken);

        if (mapStatus is null)
        {
            throw new NotFoundException(
                $"MapVersion with ID '{edge.MapVersionId}' was not found.",
                "map_version_not_found");
        }

        // Published/archived maps are immutable; only the DRAFT being edited loses the lane.
        if (mapStatus != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Edges can only be deleted from DRAFT map versions (current status: {mapStatus}).",
                "map_version_not_draft");
        }

        dbContext.Edges.Remove(edge);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
