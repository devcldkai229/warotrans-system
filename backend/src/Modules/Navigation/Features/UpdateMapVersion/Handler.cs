using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.UpdateMapVersion;

public sealed class UpdateMapVersionHandler(
    NavigationDbContext dbContext,
    IValidator<UpdateMapVersionRequest> validator)
{
    public async Task<UpdateMapVersionResponse> HandleAsync(
        Guid id,
        UpdateMapVersionRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var mapVersion = await dbContext.MapVersions
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

        if (mapVersion is null)
        {
            throw new NotFoundException($"MapVersion with ID '{id}' was not found.", "map_version_not_found");
        }

        if (mapVersion.Status != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Only DRAFT map versions can be updated (current status: {mapVersion.Status}).",
                "map_version_not_draft");
        }

        mapVersion.Name = request.Name.Trim();
        mapVersion.MapUri = request.MapUri.Trim();
        mapVersion.Resolution = request.Resolution;
        mapVersion.OriginX = request.OriginX;
        mapVersion.OriginY = request.OriginY;
        mapVersion.OriginYaw = request.OriginYaw;

        await dbContext.SaveChangesAsync(cancellationToken);

        return new UpdateMapVersionResponse(
            mapVersion.Id,
            mapVersion.WarehouseId,
            mapVersion.VersionNo,
            mapVersion.Name,
            mapVersion.Status.ToString(),
            mapVersion.MapUri,
            mapVersion.Resolution,
            mapVersion.OriginX,
            mapVersion.OriginY,
            mapVersion.OriginYaw,
            mapVersion.CreatedAt,
            mapVersion.PublishedAt);
    }
}
