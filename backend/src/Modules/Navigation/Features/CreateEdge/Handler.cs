using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Geometry;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.CreateEdge;

public sealed class CreateEdgeHandler(
    NavigationDbContext dbContext,
    IBusinessCodeGenerator codeGenerator,
    IValidator<CreateEdgeRequest> validator)
{
    public async Task<EdgeResponse> HandleAsync(
        Guid mapVersionId,
        CreateEdgeRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == mapVersionId, cancellationToken);

        if (mapVersion is null)
        {
            throw new NotFoundException($"MapVersion with ID '{mapVersionId}' was not found.", "map_version_not_found");
        }

        if (mapVersion.Status != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Edges can only be added to DRAFT map versions (current status: {mapVersion.Status}).",
                "map_version_not_draft");
        }

        var edge = new Edge
        {
            Id = Guid.NewGuid(),
            MapVersionId = mapVersionId,
            Code = await codeGenerator.NextEdgeCodeAsync(cancellationToken),
            Geometry = GeoJsonGeometry.NormalizeLineString(request.Geometry),
            WidthMeters = request.WidthMeters,
            Direction = Enum.Parse<EdgeDirection>(request.Direction, ignoreCase: true),
            Capacity = request.Capacity,
            MaxSpeed = request.MaxSpeed,
            IsActive = request.IsActive ?? true
        };

        dbContext.Edges.Add(edge);
        await dbContext.SaveChangesAsync(cancellationToken);

        return EdgeResponse.From(edge);
    }
}
