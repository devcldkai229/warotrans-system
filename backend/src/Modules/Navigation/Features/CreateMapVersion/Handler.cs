using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.CreateMapVersion;

public sealed class CreateMapVersionHandler(
    NavigationDbContext dbContext,
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

        var lastVersionNo = await dbContext.MapVersions
            .Where(m => m.WarehouseId == warehouseId)
            .MaxAsync(m => (int?)m.VersionNo, cancellationToken) ?? 0;

        var nextVersionNo = lastVersionNo + 1;
        var now = DateTimeOffset.UtcNow;

        var mapVersion = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            VersionNo = nextVersionNo,
            Name = request.Name.Trim(),
            Status = MapStatus.DRAFT,
            MapUri = request.MapUri.Trim(),
            Resolution = request.Resolution,
            OriginX = request.OriginX,
            OriginY = request.OriginY,
            OriginYaw = request.OriginYaw,
            CreatedAt = now,
            PublishedAt = null
        };

        dbContext.MapVersions.Add(mapVersion);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new MapVersionResponse(
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
