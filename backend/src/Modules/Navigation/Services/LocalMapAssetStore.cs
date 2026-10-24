using Microsoft.Extensions.Hosting;

namespace WaroTrans.Navigation.Services;

public sealed class LocalMapAssetStore(IHostEnvironment environment) : IMapAssetStore
{
    public string ProviderName => "Local";

    public string RootPath { get; } = Path.GetFullPath(
        Path.Combine(environment.ContentRootPath, "data", "maps"));

    public async Task<MapAssetUris> SaveImportedAsync(
        Guid warehouseId,
        Guid mapVersionId,
        byte[] pgmBytes,
        string yamlText,
        byte[] previewPngBytes,
        CancellationToken cancellationToken = default)
    {
        var dir = Path.Combine(RootPath, warehouseId.ToString("D"), mapVersionId.ToString("D"));
        Directory.CreateDirectory(dir);

        var pgmPath = Path.Combine(dir, "map.pgm");
        var yamlPath = Path.Combine(dir, "map.yaml");
        var previewPath = Path.Combine(dir, "map-preview.png");

        await File.WriteAllBytesAsync(pgmPath, pgmBytes, cancellationToken);
        await File.WriteAllTextAsync(yamlPath, yamlText, cancellationToken);
        await File.WriteAllBytesAsync(previewPath, previewPngBytes, cancellationToken);

        var baseUrl = $"/map-assets/{warehouseId:D}/{mapVersionId:D}";
        return new MapAssetUris(
            $"{baseUrl}/map.pgm",
            $"{baseUrl}/map.yaml",
            $"{baseUrl}/map-preview.png");
    }

    public async Task<byte[]?> TryReadMapPgmAsync(
        string mapUri,
        Guid warehouseId,
        Guid mapVersionId,
        CancellationToken cancellationToken = default)
    {
        if (PendingMapAssetUris.IsPending(mapUri))
        {
            return null;
        }

        var pgmPath = Path.Combine(RootPath, warehouseId.ToString("D"), mapVersionId.ToString("D"), "map.pgm");
        if (!File.Exists(pgmPath))
        {
            return null;
        }

        return await File.ReadAllBytesAsync(pgmPath, cancellationToken);
    }
}
