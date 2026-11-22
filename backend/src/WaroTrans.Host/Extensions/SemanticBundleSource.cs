using Amazon;
using Amazon.S3;
using Amazon.S3.Model;

namespace WaroTrans.Host.Extensions;

/// <summary>
/// A cloud Host has no robot repository on disk: with <c>Traffic:SemanticMapS3Uri</c> set, the semantic bundle is
/// copied from S3 into a local folder before anything reads <c>Traffic:SemanticMapDirectory</c>, which then points
/// there. A configured bundle that cannot be copied stops the start: every Semantic MOVE would fail otherwise.
/// </summary>
public static class SemanticBundleSource
{
    public static async Task FetchIntoConfigurationAsync(ConfigurationManager configuration, CancellationToken cancellationToken = default)
    {
        var uri = configuration["Traffic:SemanticMapS3Uri"]?.Trim();
        if (string.IsNullOrEmpty(uri))
        {
            return;
        }

        var (bucket, prefix) = Parse(uri);
        var regionName = configuration["Traffic:SemanticMapS3Region"];
        using var client = string.IsNullOrWhiteSpace(regionName)
            ? new AmazonS3Client()
            : new AmazonS3Client(RegionEndpoint.GetBySystemName(regionName));

        var target = Path.Combine(Path.GetTempPath(), "warotrans-semantic", prefix.TrimEnd('/').Replace('/', '_'));
        var files = await DownloadAsync(client, bucket, prefix, target, cancellationToken);
        if (!File.Exists(Path.Combine(target, "semantic_manifest.json")))
        {
            throw new InvalidOperationException(
                $"Traffic:SemanticMapS3Uri {uri}: no semantic_manifest.json among the {files} object(s) copied.");
        }

        configuration["Traffic:SemanticMapDirectory"] = target;
        Console.WriteLine($"Semantic bundle: {files} file(s) from {uri} -> {target}");
    }

    /// <summary><c>s3://bucket/a/b</c> → (bucket, <c>a/b/</c>).</summary>
    public static (string Bucket, string Prefix) Parse(string uri)
    {
        if (!uri.StartsWith("s3://", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Traffic:SemanticMapS3Uri must look like s3://bucket/prefix/, got '{uri}'.");
        }

        var rest = uri[5..];
        var slash = rest.IndexOf('/');
        var bucket = slash < 0 ? rest : rest[..slash];
        var prefix = slash < 0 ? "" : rest[(slash + 1)..];
        if (string.IsNullOrEmpty(bucket) || string.IsNullOrEmpty(prefix.Trim('/')))
        {
            throw new InvalidOperationException($"Traffic:SemanticMapS3Uri needs a bucket and a prefix, got '{uri}'.");
        }

        return (bucket, prefix.EndsWith('/') ? prefix : prefix + "/");
    }

    private static async Task<int> DownloadAsync(IAmazonS3 client, string bucket, string prefix, string target, CancellationToken ct)
    {
        if (Directory.Exists(target))
        {
            Directory.Delete(target, recursive: true);
        }

        Directory.CreateDirectory(target);
        var count = 0;
        var request = new ListObjectsV2Request { BucketName = bucket, Prefix = prefix };
        ListObjectsV2Response page;
        do
        {
            page = await client.ListObjectsV2Async(request, ct);
            foreach (var obj in page.S3Objects ?? [])
            {
                var relative = obj.Key[prefix.Length..];
                if (relative.Length == 0 || relative.EndsWith('/'))
                {
                    continue;
                }

                var path = Path.GetFullPath(Path.Combine(target, relative));
                if (!path.StartsWith(Path.GetFullPath(target), StringComparison.Ordinal))
                {
                    continue; // a key with ../ never leaves the folder
                }

                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                using var response = await client.GetObjectAsync(bucket, obj.Key, ct);
                await using var file = File.Create(path);
                await response.ResponseStream.CopyToAsync(file, ct);
                count++;
            }

            request.ContinuationToken = page.NextContinuationToken;
        }
        while (page.IsTruncated == true);

        return count;
    }
}
