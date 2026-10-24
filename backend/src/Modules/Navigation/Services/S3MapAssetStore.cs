using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;

namespace WaroTrans.Navigation.Services;

/// <summary>
/// Stores imported map assets in S3. Bucket/credentials come from MapAssetStorage:S3 config
/// (fill BucketName when ready; empty bucket fails at upload with a clear error).
/// </summary>
public sealed class S3MapAssetStore : IMapAssetStore, IDisposable
{
    private readonly S3MapAssetStorageOptions _options;
    private readonly IAmazonS3 _client;

    public S3MapAssetStore(IOptions<MapAssetStorageOptions> options)
    {
        _options = options.Value.S3 ?? new S3MapAssetStorageOptions();
        var region = RegionEndpoint.GetBySystemName(
            string.IsNullOrWhiteSpace(_options.Region) ? "ap-southeast-1" : _options.Region);

        if (!string.IsNullOrWhiteSpace(_options.AccessKeyId)
            && !string.IsNullOrWhiteSpace(_options.SecretAccessKey))
        {
            _client = new AmazonS3Client(
                new BasicAWSCredentials(_options.AccessKeyId, _options.SecretAccessKey),
                region);
        }
        else
        {
            _client = new AmazonS3Client(region);
        }
    }

    public string ProviderName => "S3";

    public async Task<MapAssetUris> SaveImportedAsync(
        Guid warehouseId,
        Guid mapVersionId,
        byte[] pgmBytes,
        string yamlText,
        byte[] previewPngBytes,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.BucketName))
        {
            throw new AppException(
                "MapAssetStorage:S3:BucketName is not configured. Set the bucket name before importing maps to S3.",
                503,
                "map_asset_storage_not_configured");
        }

        var prefix = string.IsNullOrWhiteSpace(_options.KeyPrefix) ? "maps" : _options.KeyPrefix.Trim().Trim('/');
        var baseKey = $"{prefix}/{warehouseId:D}/{mapVersionId:D}";

        var pgmKey = $"{baseKey}/map.pgm";
        var yamlKey = $"{baseKey}/map.yaml";
        var previewKey = $"{baseKey}/map-preview.png";

        await PutAsync(pgmKey, pgmBytes, "image/x-portable-graymap", cancellationToken);
        await PutAsync(yamlKey, System.Text.Encoding.UTF8.GetBytes(yamlText), "text/yaml", cancellationToken);
        await PutAsync(previewKey, previewPngBytes, "image/png", cancellationToken);

        return new MapAssetUris(
            ToPublicUri(pgmKey),
            ToPublicUri(yamlKey),
            ToPublicUri(previewKey));
    }

    private async Task PutAsync(
        string key,
        byte[] bytes,
        string contentType,
        CancellationToken cancellationToken)
    {
        await using var stream = new MemoryStream(bytes);
        var request = new PutObjectRequest
        {
            BucketName = _options.BucketName,
            Key = key,
            InputStream = stream,
            ContentType = contentType,
            AutoCloseStream = false
        };

        await _client.PutObjectAsync(request, cancellationToken);
    }

    private string ToPublicUri(string key)
    {
        if (!string.IsNullOrWhiteSpace(_options.PublicBaseUrl))
        {
            return $"{_options.PublicBaseUrl.TrimEnd('/')}/{key}";
        }

        return $"https://{_options.BucketName}.s3.{_options.Region}.amazonaws.com/{key}";
    }

    public async Task<byte[]?> TryReadMapPgmAsync(
        string mapUri,
        Guid warehouseId,
        Guid mapVersionId,
        CancellationToken cancellationToken = default)
    {
        if (PendingMapAssetUris.IsPending(mapUri) || string.IsNullOrWhiteSpace(_options.BucketName))
        {
            return null;
        }

        var prefix = string.IsNullOrWhiteSpace(_options.KeyPrefix) ? "maps" : _options.KeyPrefix.Trim().Trim('/');
        var key = $"{prefix}/{warehouseId:D}/{mapVersionId:D}/map.pgm";
        try
        {
            using var response = await _client.GetObjectAsync(_options.BucketName, key, cancellationToken);
            await using var stream = response.ResponseStream;
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms, cancellationToken);
            return ms.ToArray();
        }
        catch (AmazonS3Exception)
        {
            return null;
        }
    }

    public void Dispose() => _client.Dispose();
}
