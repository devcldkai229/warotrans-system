using System.Net;
using Amazon.S3;
using Amazon.S3.Model;

namespace WaroTrans.Evidence.Storage;

/// <summary>
/// The raw bucket on S3. Robots get presigned PUTs (no AWS credential on the Pi). The robot sends the SHA-256 as
/// <c>x-amz-checksum-sha256</c>, so S3 refuses a corrupted body and keeps the checksum for verification.
/// </summary>
public sealed class S3ObjectStore(IAmazonS3 s3, EvidenceStorageOptions options, TimeProvider clock) : IObjectStore
{
    public string Bucket => options.RawBucket;

    public Task<PresignedUpload> PresignPutAsync(string key, long contentLength, string sha256Hex, TimeSpan ttl, CancellationToken cancellationToken)
    {
        var expires = clock.GetUtcNow().Add(ttl);
        var request = new GetPreSignedUrlRequest
        {
            BucketName = Bucket,
            Key = key,
            Verb = HttpVerb.PUT,
            Expires = expires.UtcDateTime,
            ContentType = "video/x-msvideo"
        };
        var checksum = Checksums.HexToBase64(sha256Hex);
        request.Headers["x-amz-checksum-sha256"] = checksum;
        request.Headers["x-amz-sdk-checksum-algorithm"] = "SHA256";
        var url = s3.GetPreSignedURL(request);
        IReadOnlyDictionary<string, string> headers = new Dictionary<string, string>
        {
            ["Content-Type"] = "video/x-msvideo",
            ["x-amz-checksum-sha256"] = checksum,
            ["x-amz-sdk-checksum-algorithm"] = "SHA256",
            // Conditional write: an original that is already there is never replaced.
            ["If-None-Match"] = "*"
        };
        return Task.FromResult(new PresignedUpload(url, "PUT", headers, expires));
    }

    public async Task<StoredObject?> HeadAsync(string key, CancellationToken cancellationToken, string? bucket = null)
    {
        try
        {
            var head = await s3.GetObjectMetadataAsync(new GetObjectMetadataRequest
            {
                BucketName = bucket ?? Bucket,
                Key = key,
                ChecksumMode = ChecksumMode.ENABLED
            }, cancellationToken);
            var sha = string.IsNullOrEmpty(head.ChecksumSHA256) || head.ChecksumSHA256.Contains('-')
                ? null // a multipart checksum-of-checksums is not the file's SHA-256
                : Checksums.Base64ToHex(head.ChecksumSHA256);
            return new StoredObject(bucket ?? Bucket, key, head.ContentLength, sha, head.ETag, head.VersionId,
                new DateTimeOffset(DateTime.SpecifyKind(head.LastModified, DateTimeKind.Utc)));
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<StoredObject>> ListAsync(string prefix, CancellationToken cancellationToken)
    {
        var result = new List<StoredObject>();
        string? token = null;
        do
        {
            var page = await s3.ListObjectsV2Async(new ListObjectsV2Request
            {
                BucketName = Bucket,
                Prefix = prefix,
                ContinuationToken = token
            }, cancellationToken);
            result.AddRange((page.S3Objects ?? []).Select(o => new StoredObject(Bucket, o.Key, o.Size, null, o.ETag, null,
                new DateTimeOffset(DateTime.SpecifyKind(o.LastModified, DateTimeKind.Utc)))));
            token = page.IsTruncated == true ? page.NextContinuationToken : null;
        }
        while (token is not null);

        return result;
    }

    public async Task<Stream?> OpenReadAsync(string key, CancellationToken cancellationToken, string? bucket = null)
    {
        try
        {
            var response = await s3.GetObjectAsync(bucket ?? Bucket, key, cancellationToken);
            return response.ResponseStream;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }
}
