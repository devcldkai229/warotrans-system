using Amazon.Runtime;

namespace WaroTrans.Evidence;

/// <summary>
/// The AWS access key of this service (IAM user warotrans-evidence-recorder-&lt;env&gt; or -worker-&lt;env&gt;), for hosts
/// without an AWS profile or role. Both empty = the SDK's default credential chain (profile, environment, instance role).
/// Keep the values in user secrets or the environment (Evidence__Aws__AccessKeyId), never in a committed appsettings file.
/// </summary>
public sealed class EvidenceAwsOptions
{
    public const string SectionName = "Evidence:Aws";

    public string? AccessKeyId { get; set; }
    public string? SecretAccessKey { get; set; }

    /// <summary>The configured key, or null for the default credential chain.</summary>
    public AWSCredentials? Credentials() =>
        string.IsNullOrWhiteSpace(AccessKeyId) || string.IsNullOrWhiteSpace(SecretAccessKey)
            ? null
            : new BasicAWSCredentials(AccessKeyId, SecretAccessKey);
}
