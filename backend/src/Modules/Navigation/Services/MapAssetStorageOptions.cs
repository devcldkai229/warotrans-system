namespace WaroTrans.Navigation.Services;

/// <summary>
/// Map occupancy assets (pgm/yaml/preview). Provider Local keeps files under Host data/maps;
/// Provider S3 uploads to the configured bucket and persists the public URI on MapVersion.
/// </summary>
public sealed class MapAssetStorageOptions
{
    public const string SectionName = "MapAssetStorage";

    /// <summary>Local | S3</summary>
    public string Provider { get; set; } = "Local";

    public S3MapAssetStorageOptions S3 { get; set; } = new();
}

public sealed class S3MapAssetStorageOptions
{
    public string BucketName { get; set; } = string.Empty;
    public string Region { get; set; } = "ap-southeast-1";
    public string KeyPrefix { get; set; } = "maps";

    /// <summary>
    /// Optional public base (CloudFront or S3 website). When empty, URIs are
    /// https://{bucket}.s3.{region}.amazonaws.com/{key}.
    /// </summary>
    public string? PublicBaseUrl { get; set; }

    /// <summary>Optional explicit credentials; when empty, uses the default AWS credential chain.</summary>
    public string? AccessKeyId { get; set; }

    public string? SecretAccessKey { get; set; }
}
