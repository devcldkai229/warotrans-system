using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Navigation.Features.CloneMapVersion;

/// <summary>
/// Copies a map version (any status) into a new DRAFT of the same warehouse so it can be edited: same occupancy
/// image (asset URIs are reused, assets are never deleted) and a copy of every endpoint, zone, edge and endpoint
/// group. Codes are never copied: they come from the system code generator like any new item (endpoint EP-{NAME},
/// zone ZONE-{NAME}, edge EDGE-nnn); ids are new and endpoints remember their source (SourceEndpointId) so
/// storage locations can follow them on publish.
/// </summary>
public sealed class CloneMapVersionHandler(
    NavigationDbContext dbContext,
    IWarehouseModule warehouseModule,
    IBusinessCodeGenerator codeGenerator)
{
    private const int NameMaxLength = 500;

    public async Task<MapVersionResponse> HandleAsync(
        Guid sourceMapVersionId,
        CloneMapVersionRequest request,
        CancellationToken cancellationToken = default)
    {
        var source = await dbContext.MapVersions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == sourceMapVersionId, cancellationToken)
            ?? throw new NotFoundException($"MapVersion with ID '{sourceMapVersionId}' was not found.", "map_version_not_found");

        if (PendingMapAssetUris.IsPending(source.MapUri))
        {
            throw new DomainValidationException(
                "Cannot clone a map without occupancy assets. Import yaml + pgm first.",
                "map_assets_pending");
        }

        var warehouse = await warehouseModule.GetWarehouseAsync(source.WarehouseId, cancellationToken)
            ?? throw new NotFoundException($"Warehouse '{source.WarehouseId}' was not found.", "warehouse_not_found");

        var lastVersionNo = await dbContext.MapVersions
            .Where(m => m.WarehouseId == source.WarehouseId)
            .MaxAsync(m => (int?)m.VersionNo, cancellationToken) ?? 0;
        var versionNo = lastVersionNo + 1;
        var name = string.IsNullOrWhiteSpace(request.Name) ? $"Copy of {source.Name}" : request.Name.Trim();

        var clone = new MapVersion
        {
            Id = Guid.NewGuid(),
            WarehouseId = source.WarehouseId,
            Code = await codeGenerator.NextMapVersionCodeAsync(warehouse.Code, versionNo, cancellationToken),
            VersionNo = versionNo,
            Name = name.Length > NameMaxLength ? name[..NameMaxLength] : name,
            Status = MapStatus.DRAFT,
            MapUri = source.MapUri,
            MapYamlUri = source.MapYamlUri,
            PreviewImageUri = source.PreviewImageUri,
            FrameId = source.FrameId,
            ImageWidthPixels = source.ImageWidthPixels,
            ImageHeightPixels = source.ImageHeightPixels,
            Resolution = source.Resolution,
            OriginX = source.OriginX,
            OriginY = source.OriginY,
            OriginYaw = source.OriginYaw,
            Negate = source.Negate,
            OccupiedThreshold = source.OccupiedThreshold,
            FreeThreshold = source.FreeThreshold,
            ContentHash = source.ContentHash,
            SourceMapVersionId = source.Id,
            CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = null
        };
        dbContext.MapVersions.Add(clone);

        var endpointIds = new Dictionary<Guid, Guid>();
        foreach (var endpoint in await dbContext.Endpoints.AsNoTracking()
                     .Where(e => e.MapVersionId == source.Id).OrderBy(e => e.Code).ToListAsync(cancellationToken))
        {
            var copy = new Endpoint
            {
                Id = Guid.NewGuid(),
                MapVersionId = clone.Id,
                Code = await codeGenerator.NextEndpointCodeAsync(endpoint.Name, cancellationToken),
                Name = endpoint.Name,
                EndpointType = endpoint.EndpointType,
                X = endpoint.X,
                Y = endpoint.Y,
                Yaw = endpoint.Yaw,
                PositionTolerance = endpoint.PositionTolerance,
                YawTolerance = endpoint.YawTolerance,
                IsEnabled = endpoint.IsEnabled,
                SourceEndpointId = endpoint.Id
            };
            endpointIds[endpoint.Id] = copy.Id;
            dbContext.Endpoints.Add(copy);
        }

        foreach (var zone in await dbContext.Zones.AsNoTracking()
                     .Where(z => z.MapVersionId == source.Id).OrderBy(z => z.Code).ToListAsync(cancellationToken))
        {
            dbContext.Zones.Add(new Zone
            {
                Id = Guid.NewGuid(),
                MapVersionId = clone.Id,
                Code = await codeGenerator.NextZoneCodeAsync(zone.Name, cancellationToken),
                Name = zone.Name,
                ZoneType = zone.ZoneType,
                Geometry = Copy(zone.Geometry),
                Capacity = zone.Capacity,
                MaxSpeed = zone.MaxSpeed,
                IsActive = zone.IsActive,
                Policy = zone.Policy is null ? null : Copy(zone.Policy),
                PolicySchemaVersion = zone.PolicySchemaVersion
            });
        }

        foreach (var edge in await dbContext.Edges.AsNoTracking()
                     .Where(e => e.MapVersionId == source.Id).OrderBy(e => e.Code).ToListAsync(cancellationToken))
        {
            dbContext.Edges.Add(new Edge
            {
                Id = Guid.NewGuid(),
                MapVersionId = clone.Id,
                Code = await codeGenerator.NextEdgeCodeAsync(cancellationToken),
                Geometry = Copy(edge.Geometry),
                WidthMeters = edge.WidthMeters,
                Direction = edge.Direction,
                Capacity = edge.Capacity,
                MaxSpeed = edge.MaxSpeed,
                IsActive = edge.IsActive
            });
        }

        // Endpoint groups have no system-wide code sequence (their code is unique per map only): keep it.
        var groups = await dbContext.EndpointGroups.AsNoTracking()
            .Where(g => g.MapVersionId == source.Id).ToListAsync(cancellationToken);
        var groupIds = groups.Select(g => g.Id).ToList();
        var members = await dbContext.EndpointGroupMembers.AsNoTracking()
            .Where(m => groupIds.Contains(m.EndpointGroupId)).ToListAsync(cancellationToken);
        foreach (var group in groups)
        {
            var copy = new EndpointGroup
            {
                Id = Guid.NewGuid(),
                MapVersionId = clone.Id,
                Code = group.Code,
                Name = group.Name,
                SelectionPolicy = group.SelectionPolicy,
                IsActive = group.IsActive
            };
            dbContext.EndpointGroups.Add(copy);
            foreach (var member in members.Where(m => m.EndpointGroupId == group.Id && endpointIds.ContainsKey(m.EndpointId)))
            {
                dbContext.EndpointGroupMembers.Add(new EndpointGroupMember
                {
                    EndpointGroupId = copy.Id,
                    EndpointId = endpointIds[member.EndpointId]
                });
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapVersionResponse.From(clone);
    }

    private static JsonDocument Copy(JsonDocument document) => JsonDocument.Parse(document.RootElement.GetRawText());
}
