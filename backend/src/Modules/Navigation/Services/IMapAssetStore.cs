namespace WaroTrans.Navigation.Services;

public interface IMapAssetStore
{
    /// <summary>Storage provider label: Local or S3.</summary>
    string ProviderName { get; }

    /// <summary>
    /// Writes map.pgm, map.yaml, and map-preview.png for a map version.
    /// Returns URIs persisted on MapVersion (local /map-assets/... or S3 HTTPS URLs).
    /// </summary>
    Task<MapAssetUris> SaveImportedAsync(
        Guid warehouseId,
        Guid mapVersionId,
        byte[] pgmBytes,
        string yamlText,
        byte[] previewPngBytes,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Reads occupancy PGM bytes for a map version when available; returns null if missing or unsupported.
    /// </summary>
    Task<byte[]?> TryReadMapPgmAsync(
        string mapUri,
        Guid warehouseId,
        Guid mapVersionId,
        CancellationToken cancellationToken = default);
}

public sealed record MapAssetUris(string MapUri, string MapYamlUri, string PreviewImageUri);

/// <summary>Placeholder MapUri for metadata-only DRAFT maps before assets are uploaded.</summary>
public static class PendingMapAssetUris
{
    public const string MapUri = "pending://map";
    public const string MapYamlUri = "pending://map.yaml";
    public const string PreviewImageUri = "pending://map-preview.png";

    public static bool IsPending(string? uri) =>
        string.IsNullOrWhiteSpace(uri)
        || uri.StartsWith("pending://", StringComparison.OrdinalIgnoreCase);
}
