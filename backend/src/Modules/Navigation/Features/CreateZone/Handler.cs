using System.Text.Json;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Geometry;
using WaroTrans.Navigation.Persistence;

namespace WaroTrans.Navigation.Features.CreateZone;

public sealed class CreateZoneHandler(
    NavigationDbContext dbContext,
    IBusinessCodeGenerator codeGenerator,
    IValidator<CreateZoneRequest> validator)
{
    public async Task<ZoneResponse> HandleAsync(
        Guid mapVersionId,
        CreateZoneRequest request,
        CancellationToken cancellationToken = default)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            throw new ValidationException(validationResult.Errors);
        }

        var mapVersion = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == mapVersionId, cancellationToken)
            ?? throw new NotFoundException($"MapVersion with ID '{mapVersionId}' was not found.", "map_version_not_found");

        if (mapVersion.Status != MapStatus.DRAFT)
        {
            throw new DomainValidationException(
                $"Zones can only be added to DRAFT map versions (current status: {mapVersion.Status}).",
                "map_version_not_draft");
        }

        var zoneType = Enum.Parse<ZoneType>(request.ZoneType, ignoreCase: true);
        var policyDoc = request.Policy is { } policyEl && policyEl.ValueKind is not JsonValueKind.Undefined and not JsonValueKind.Null
            ? JsonDocument.Parse(policyEl.GetRawText())
            : null;
        var schemaVersion = request.PolicySchemaVersion ?? ZonePolicyValidator.SchemaVersion;

        ZonePolicyValidator.Validate(zoneType, request.Capacity, request.MaxSpeed, policyDoc, schemaVersion);

        var code = string.IsNullOrWhiteSpace(request.Code)
            ? await codeGenerator.NextZoneCodeAsync(request.Name, cancellationToken)
            : request.Code.Trim().ToUpperInvariant();

        var zone = new Zone
        {
            Id = Guid.NewGuid(),
            MapVersionId = mapVersionId,
            Code = code,
            Name = request.Name.Trim(),
            ZoneType = zoneType,
            Geometry = GeoJsonGeometry.NormalizePolygon(request.Geometry),
            Capacity = request.Capacity,
            MaxSpeed = request.MaxSpeed,
            IsActive = request.IsActive ?? true,
            Policy = policyDoc,
            PolicySchemaVersion = schemaVersion
        };

        dbContext.Zones.Add(zone);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException($"Zone code '{code}' already exists on this map.", "zone_code_exists");
        }

        return ZoneResponse.From(zone);
    }
}
