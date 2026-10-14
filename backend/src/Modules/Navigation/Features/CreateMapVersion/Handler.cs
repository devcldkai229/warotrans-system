using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Navigation.Features.CreateMapVersion;

public sealed class CreateMapVersionHandler(
    NavigationDbContext dbContext,
    IWarehouseModule warehouseModule,
    IBusinessCodeGenerator codeGenerator,
    IValidator<CreateMapVersionRequest> validator)
{
    public async Task<MapVersionResponse> HandleAsync(
        Guid warehouseId,
        CreateMapVersionRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var warehouse = await warehouseModule.GetWarehouseAsync(warehouseId, cancellationToken)
            ?? throw new NotFoundException($"Warehouse '{warehouseId}' was not found.", "warehouse_not_found");

        if (!warehouse.IsActive)
        {
            throw new DomainValidationException($"Warehouse '{warehouse.Code}' is inactive.", "warehouse_inactive");
        }

        var lastVersionNo = await dbContext.MapVersions
            .Where(m => m.WarehouseId == warehouseId)
            .MaxAsync(m => (int?)m.VersionNo, cancellationToken) ?? 0;

        var nextVersionNo = lastVersionNo + 1;
        var code = await codeGenerator.NextMapVersionCodeAsync(warehouse.Code, nextVersionNo, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var mapVersion = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            Code = code,
            VersionNo = nextVersionNo,
            Name = request.Name.Trim(),
            Status = MapStatus.DRAFT,
            MapUri = string.IsNullOrWhiteSpace(request.MapUri)
                ? PendingMapAssetUris.MapUri
                : request.MapUri.Trim(),
            MapYamlUri = string.IsNullOrWhiteSpace(request.MapYamlUri)
                ? PendingMapAssetUris.MapYamlUri
                : request.MapYamlUri.Trim(),
            PreviewImageUri = string.IsNullOrWhiteSpace(request.PreviewImageUri)
                ? PendingMapAssetUris.PreviewImageUri
                : request.PreviewImageUri.Trim(),
            FrameId = string.IsNullOrWhiteSpace(request.FrameId) ? "map" : request.FrameId.Trim(),
            ImageWidthPixels = request.ImageWidthPixels ?? 0,
            ImageHeightPixels = request.ImageHeightPixels ?? 0,
            Resolution = request.Resolution,
            OriginX = request.OriginX,
            OriginY = request.OriginY,
            OriginYaw = request.OriginYaw,
            Negate = request.Negate ?? false,
            OccupiedThreshold = request.OccupiedThreshold ?? 0.65,
            FreeThreshold = request.FreeThreshold ?? 0.25,
            ContentHash = request.ContentHash,
            CreatedAt = now,
            PublishedAt = null
        };

        dbContext.MapVersions.Add(mapVersion);
        await dbContext.SaveChangesAsync(cancellationToken);

        return MapVersionResponse.From(mapVersion);
    }
}
