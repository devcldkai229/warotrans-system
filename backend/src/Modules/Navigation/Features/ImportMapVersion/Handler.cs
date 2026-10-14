using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.Navigation.Entities;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.Features.Shared;
using WaroTrans.Navigation.Persistence;
using WaroTrans.Navigation.Services;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Navigation.Features.ImportMapVersion;

public sealed class ImportMapVersionHandler(
    NavigationDbContext dbContext,
    IWarehouseModule warehouseModule,
    IBusinessCodeGenerator codeGenerator,
    IMapAssetStore mapAssetStore)
{
    public async Task<MapVersionResponse> HandleAsync(
        Guid warehouseId,
        Stream yamlStream,
        Stream pgmStream,
        string? name,
        CancellationToken cancellationToken = default)
    {
        var warehouse = await warehouseModule.GetWarehouseAsync(warehouseId, cancellationToken)
            ?? throw new NotFoundException($"Warehouse '{warehouseId}' was not found.", "warehouse_not_found");

        if (!warehouse.IsActive)
        {
            throw new DomainValidationException($"Warehouse '{warehouse.Code}' is inactive.", "warehouse_inactive");
        }

        await using var yamlMs = new MemoryStream();
        await yamlStream.CopyToAsync(yamlMs, cancellationToken);
        var yamlBytes = yamlMs.ToArray();
        var yamlText = System.Text.Encoding.UTF8.GetString(yamlBytes);

        await using var pgmMs = new MemoryStream();
        await pgmStream.CopyToAsync(pgmMs, cancellationToken);
        var pgmBytes = pgmMs.ToArray();

        if (yamlBytes.Length == 0)
        {
            throw new DomainValidationException("YAML file is empty.", "map_yaml_invalid");
        }

        if (pgmBytes.Length == 0)
        {
            throw new DomainValidationException("PGM file is empty.", "pgm_invalid");
        }

        var yamlMeta = RosMapYamlParser.Parse(yamlText);
        var pgmHeader = PgmParser.ParseHeader(pgmBytes);
        var previewPng = PgmParser.ToPreviewPng(pgmBytes, yamlMeta.Negate);

        var contentHash = Convert.ToHexString(
            SHA256.HashData(Combine(pgmBytes, yamlBytes))).ToLowerInvariant();

        var lastVersionNo = await dbContext.MapVersions
            .Where(m => m.WarehouseId == warehouseId)
            .MaxAsync(m => (int?)m.VersionNo, cancellationToken) ?? 0;

        var nextVersionNo = lastVersionNo + 1;
        var code = await codeGenerator.NextMapVersionCodeAsync(warehouse.Code, nextVersionNo, cancellationToken);
        var mapVersionId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        var uris = await mapAssetStore.SaveImportedAsync(
            warehouseId,
            mapVersionId,
            pgmBytes,
            yamlText,
            previewPng,
            cancellationToken);

        var displayName = string.IsNullOrWhiteSpace(name)
            ? $"Imported map v{nextVersionNo}"
            : name.Trim();

        var mapVersion = new MapVersion
        {
            Id = mapVersionId,
            WarehouseId = warehouseId,
            Code = code,
            VersionNo = nextVersionNo,
            Name = displayName,
            Status = MapStatus.DRAFT,
            MapUri = uris.MapUri,
            MapYamlUri = uris.MapYamlUri,
            PreviewImageUri = uris.PreviewImageUri,
            FrameId = "map",
            ImageWidthPixels = pgmHeader.Width,
            ImageHeightPixels = pgmHeader.Height,
            Resolution = yamlMeta.Resolution,
            OriginX = yamlMeta.OriginX,
            OriginY = yamlMeta.OriginY,
            OriginYaw = yamlMeta.OriginYaw,
            Negate = yamlMeta.Negate,
            OccupiedThreshold = yamlMeta.OccupiedThreshold,
            FreeThreshold = yamlMeta.FreeThreshold,
            ContentHash = contentHash,
            CreatedAt = now,
            PublishedAt = null
        };

        dbContext.MapVersions.Add(mapVersion);
        await dbContext.SaveChangesAsync(cancellationToken);

        return MapVersionResponse.From(mapVersion);
    }

    private static byte[] Combine(byte[] a, byte[] b)
    {
        var result = new byte[a.Length + b.Length];
        Buffer.BlockCopy(a, 0, result, 0, a.Length);
        Buffer.BlockCopy(b, 0, result, a.Length, b.Length);
        return result;
    }
}
