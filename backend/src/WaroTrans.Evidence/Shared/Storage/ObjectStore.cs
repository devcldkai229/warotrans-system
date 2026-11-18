namespace WaroTrans.Evidence.Storage;

/// <summary>
/// Where original segments and playback output live. AWS: S3 (presigned PUT straight from the robot). Local (tests,
/// offline dev): a folder, with uploads accepted by the Recorder's local-store endpoint.
/// </summary>
public interface IObjectStore
{
    /// <summary>The raw bucket (or local root name) segment keys live in.</summary>
    string Bucket { get; }

    /// <summary>
    /// A one-object upload the robot can do without any AWS credential. The checksum header makes the store refuse a
    /// body that is not the registered file; If-None-Match keeps an uploaded original from being overwritten.
    /// </summary>
    Task<PresignedUpload> PresignPutAsync(string key, long contentLength, string sha256Hex, TimeSpan ttl, CancellationToken cancellationToken);

    /// <returns>Null when there is no such object.</returns>
    /// <param name="bucket">Another bucket of the same store (the playback bucket); null: <see cref="Bucket"/>.</param>
    Task<StoredObject?> HeadAsync(string key, CancellationToken cancellationToken, string? bucket = null);

    Task<IReadOnlyList<StoredObject>> ListAsync(string prefix, CancellationToken cancellationToken);

    /// <returns>Null when there is no such object.</returns>
    Task<Stream?> OpenReadAsync(string key, CancellationToken cancellationToken, string? bucket = null);
}

public sealed record PresignedUpload(string Url, string Method, IReadOnlyDictionary<string, string> Headers, DateTimeOffset ExpiresAtUtc);

/// <param name="Sha256Hex">The checksum the store verified on upload, lowercase hex; null if it kept none.</param>
public sealed record StoredObject(string Bucket, string Key, long Size, string? Sha256Hex, string? ETag, string? VersionId, DateTimeOffset LastModifiedUtc);

public static class Checksums
{
    public static string HexToBase64(string hex) => Convert.ToBase64String(Convert.FromHexString(hex));

    public static string Base64ToHex(string base64) => Convert.ToHexStringLower(Convert.FromBase64String(base64));

    public static async Task<string> Sha256HexAsync(Stream stream, CancellationToken cancellationToken)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        var hash = await sha.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexStringLower(hash);
    }
}

public sealed class EvidenceStorageOptions
{
    public const string SectionName = "Evidence:Storage";

    /// <summary>Local or S3.</summary>
    public string Provider { get; set; } = "Local";

    public string RawBucket { get; set; } = "warotrans-evidence-local";
    public string PlaybackBucket { get; set; } = "warotrans-evidence-local";
    public string Region { get; set; } = "ap-southeast-1";

    /// <summary>S3-compatible endpoint (tests against LocalStack/MinIO); empty for AWS.</summary>
    public string? ServiceUrl { get; set; }

    /// <summary>Local provider: the folder objects are written to (Recorder and Worker must share it). Empty: a folder in the temp directory.</summary>
    public string LocalRoot { get; set; } = string.Empty;

    public string LocalRootPath =>
        Path.GetFullPath(string.IsNullOrWhiteSpace(LocalRoot) ? Path.Combine(Path.GetTempPath(), "warotrans-evidence-store") : LocalRoot);

    /// <summary>Local provider: the Recorder's public base URL, where robots PUT their segments.</summary>
    public string LocalPublicBaseUrl { get; set; } = "http://localhost:5095";

    /// <summary>Local provider: key for the upload URL signature (any secret of 32+ characters).</summary>
    public string LocalSigningKey { get; set; } = string.Empty;

    public int UploadGrantMinutes { get; set; } = 15;

    public bool IsS3 => string.Equals(Provider, "S3", StringComparison.OrdinalIgnoreCase);
}
