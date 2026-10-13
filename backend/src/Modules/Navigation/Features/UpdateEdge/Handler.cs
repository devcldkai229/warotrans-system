using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.UpdateEdge;

public sealed class UpdateEdgeHandler(
    NavigationDbContext dbContext,
    IValidator<UpdateEdgeRequest> validator)
{
    public async Task<UpdateEdgeResponse> HandleAsync(
        Guid id,
        UpdateEdgeRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

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

        if (mapStatus != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Edges can only be updated on DRAFT map versions (current status: {mapStatus}).",
                "map_version_not_draft");
        }

        var points = request.Geometry.Points.Select(p => new EdgePointResponse(p.X, p.Y)).ToList();

        edge.Geometry = JsonSerializer.SerializeToDocument(new { points = points.Select(p => new { x = p.X, y = p.Y }) });
        edge.Direction = Enum.Parse<EdgeDirection>(request.Direction, ignoreCase: true);
        edge.Capacity = request.Capacity;
        edge.MaxSpeed = request.MaxSpeed;
        edge.IsActive = request.IsActive;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new UpdateEdgeResponse(
            edge.Id,
            edge.MapVersionId,
            edge.Code,
            new EdgeGeometryResponse(points),
            edge.Direction.ToString(),
            edge.Capacity,
            edge.MaxSpeed,
            edge.IsActive);
    }
}
