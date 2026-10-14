using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Geometry;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.UpdateZone;

public sealed class UpdateZoneHandler(
    NavigationDbContext dbContext,
    IValidator<UpdateZoneRequest> validator)
{
    public async Task<ZoneResponse> HandleAsync(
        Guid id,
        UpdateZoneRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var zone = await dbContext.Zones.FirstOrDefaultAsync(z => z.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Zone with ID '{id}' was not found.", "zone_not_found");

        var mapStatus = await dbContext.MapVersions
            .AsNoTracking()
            .Where(m => m.Id == zone.MapVersionId)
            .Select(m => (MapStatus?)m.Status)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(
                $"MapVersion with ID '{zone.MapVersionId}' was not found.",
                "map_version_not_found");

        if (mapStatus != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Zones can only be updated on DRAFT map versions (current status: {mapStatus}).",
                "map_version_not_draft");
        }

        var zoneType = Enum.Parse<ZoneType>(request.ZoneType, ignoreCase: true);
        var policyDoc = request.Policy is { } policyEl && policyEl.ValueKind is not JsonValueKind.Undefined and not JsonValueKind.Null
            ? JsonDocument.Parse(policyEl.GetRawText())
            : null;
        var schemaVersion = request.PolicySchemaVersion ?? ZonePolicyValidator.SchemaVersion;

        ZonePolicyValidator.Validate(zoneType, request.Capacity, request.MaxSpeed, policyDoc, schemaVersion);

        zone.Geometry?.Dispose();
        zone.Policy?.Dispose();
        zone.Name = request.Name.Trim();
        zone.ZoneType = zoneType;
        zone.Geometry = GeoJsonGeometry.NormalizePolygon(request.Geometry);
        zone.Capacity = request.Capacity;
        zone.MaxSpeed = request.MaxSpeed;
        zone.IsActive = request.IsActive;
        zone.Policy = policyDoc;
        zone.PolicySchemaVersion = schemaVersion;

        await dbContext.SaveChangesAsync(cancellationToken);
        return ZoneResponse.From(zone);
    }
}
