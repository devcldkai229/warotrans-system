namespace WaroTrans.Navigation.Services;

public interface IMapAssetStore
{
    /// <summary>Absolute root directory for map assets (e.g. data/maps).</summary>
    string RootPath { get; }

    /// <summary>
    /// Writes map.pgm, map.yaml, and map-preview.png under warehouse/mapVersion.
    /// Returns public URL paths under /map-assets/...
    /// </summary>
    Task<MapAssetUris> SaveImportedAsync(
        Guid warehouseId,
        Guid mapVersionId,
        byte[] pgmBytes,
        string yamlText,
        byte[] previewPngBytes,
        CancellationToken cancellationToken = default);
}

public sealed record MapAssetUris(string MapUri, string MapYamlUri, string PreviewImageUri);
