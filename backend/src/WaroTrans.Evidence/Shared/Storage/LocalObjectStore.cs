using System.Security.Cryptography;
using System.Text;

namespace WaroTrans.Evidence.Storage;

/// <summary>
/// A folder that behaves like the raw bucket, for tests and offline development. An upload URL points at the Recorder's
/// local-store endpoint and carries an HMAC over (key, size, checksum, expiry): the Recorder writes the object only if
/// the body matches, then announces it on the segment-ingest queue the way S3 would.
/// </summary>
public sealed class LocalObjectStore(EvidenceStorageOptions options, TimeProvider clock) : IObjectStore
{
    public const string UploadPath = "/api/evidence/local-store/objects";

    public string Bucket => options.RawBucket;

    private string Root => options.LocalRootPath;

    public Task<PresignedUpload> PresignPutAsync(string key, long contentLength, string sha256Hex, TimeSpan ttl, CancellationToken cancellationToken)
    {
        var expires = clock.GetUtcNow().Add(ttl);
        var exp = expires.ToUnixTimeSeconds();
        var signature = Sign(key, contentLength, sha256Hex, exp);
        var url = $"{options.LocalPublicBaseUrl.TrimEnd('/')}{UploadPath}?key={Uri.EscapeDataString(key)}&size={contentLength}&sha256={sha256Hex}&exp={exp}&sig={signature}";
        IReadOnlyDictionary<string, string> headers = new Dictionary<string, string>
        {
            ["x-amz-checksum-sha256"] = Checksums.HexToBase64(sha256Hex),
            ["If-None-Match"] = "*",
            ["Content-Type"] = "video/x-msvideo"
        };
        return Task.FromResult(new PresignedUpload(url, "PUT", headers, expires));
    }

    /// <summary>True when the URL parameters were signed by this store and have not expired.</summary>
    public bool Verify(string key, long size, string sha256Hex, long exp, string signature) =>
        DateTimeOffset.FromUnixTimeSeconds(exp) > clock.GetUtcNow()
        && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Sign(key, size, sha256Hex, exp)), Encoding.ASCII.GetBytes(signature));

    /// <summary>Writes an uploaded object atomically (temp file, flush, rename). Refuses to overwrite.</summary>
    public async Task<StoredObject> WriteAsync(string key, Stream body, CancellationToken cancellationToken)
    {
        var path = PathOf(key);
        if (File.Exists(path))
        {
            throw new IOException("object exists");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + ".partial-" + Guid.NewGuid().ToString("N");
        await using (var file = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous))
        {
            await body.CopyToAsync(file, cancellationToken);
            await file.FlushAsync(cancellationToken);
            file.Flush(flushToDisk: true);
        }

        File.Move(temp, path);
        return (await HeadAsync(key, cancellationToken))!;
    }

    public async Task<StoredObject?> HeadAsync(string key, CancellationToken cancellationToken, string? bucket = null)
    {
        var path = PathOf(key);
        if (!File.Exists(path))
        {
            return null;
        }

        var info = new FileInfo(path);
        await using var stream = info.OpenRead();
        var sha = await Checksums.Sha256HexAsync(stream, cancellationToken);
        return new StoredObject(Bucket, key, info.Length, sha, $"\"{sha[..32]}\"", null, info.LastWriteTimeUtc);
    }

    public async Task<IReadOnlyList<StoredObject>> ListAsync(string prefix, CancellationToken cancellationToken)
    {
        var folder = PathOf(prefix.EndsWith('/') ? prefix : Path.GetDirectoryName(prefix)!.Replace('\\', '/') + "/");
        if (!Directory.Exists(folder))
        {
            return [];
        }

        var result = new List<StoredObject>();
        foreach (var file in Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories).Where(f => !f.Contains(".partial-")))
        {
            var key = Path.GetRelativePath(Root, file).Replace('\\', '/');
            if (key.StartsWith(prefix, StringComparison.Ordinal) && await HeadAsync(key, cancellationToken) is { } head)
            {
                result.Add(head);
            }
        }

        return result;
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        var path = PathOf(key);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken cancellationToken, string? bucket = null)
    {
        var path = PathOf(key);
        return Task.FromResult<Stream?>(File.Exists(path) ? File.OpenRead(path) : null);
    }

    private string PathOf(string key)
    {
        if (key.Contains("..", StringComparison.Ordinal) || Path.IsPathRooted(key))
        {
            throw new ArgumentException("Invalid key.", nameof(key));
        }

        var path = Path.GetFullPath(Path.Combine(Root, key));
        return path.StartsWith(Root, StringComparison.Ordinal) ? path : throw new ArgumentException("Invalid key.", nameof(key));
    }

    private string Sign(string key, long size, string sha256Hex, long exp)
    {
        if (options.LocalSigningKey.Length < 32)
        {
            throw new InvalidOperationException($"{EvidenceStorageOptions.SectionName}:LocalSigningKey must be at least 32 characters.");
        }

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(options.LocalSigningKey));
        return Convert.ToHexStringLower(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{key}\n{size}\n{sha256Hex}\n{exp}")));
    }
}
