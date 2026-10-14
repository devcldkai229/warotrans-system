using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.UpdateMapVersion;

public sealed class UpdateMapVersionHandler(
    NavigationDbContext dbContext,
    IValidator<UpdateMapVersionRequest> validator)
{
    public async Task<MapVersionResponse> HandleAsync(
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
        if (request.MapYamlUri is not null) mapVersion.MapYamlUri = request.MapYamlUri.Trim();
        if (request.PreviewImageUri is not null) mapVersion.PreviewImageUri = request.PreviewImageUri.Trim();
        if (!string.IsNullOrWhiteSpace(request.FrameId)) mapVersion.FrameId = request.FrameId.Trim();
        if (request.ImageWidthPixels is { } w) mapVersion.ImageWidthPixels = w;
        if (request.ImageHeightPixels is { } h) mapVersion.ImageHeightPixels = h;
        mapVersion.Resolution = request.Resolution;
        mapVersion.OriginX = request.OriginX;
        mapVersion.OriginY = request.OriginY;
        mapVersion.OriginYaw = request.OriginYaw;
        if (request.Negate is { } negate) mapVersion.Negate = negate;
        if (request.OccupiedThreshold is { } occupied) mapVersion.OccupiedThreshold = occupied;
        if (request.FreeThreshold is { } free) mapVersion.FreeThreshold = free;
        if (request.ContentHash is not null) mapVersion.ContentHash = request.ContentHash;

        await dbContext.SaveChangesAsync(cancellationToken);

        return MapVersionResponse.From(mapVersion);
    }
}
