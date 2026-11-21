using System.Security.Cryptography;
using System.Text;
using Amazon;
using Amazon.CloudFront;
using Amazon.SimpleSystemsManagement;
using Amazon.SimpleSystemsManagement.Model;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Storage;

namespace WaroTrans.Evidence.Recorder.Features.Playback;

public sealed class PlaybackOptions
{
    public const string SectionName = "Evidence:Playback";

    /// <summary>Local (the Recorder serves HLS from the local store) or CloudFront.</summary>
    public string Provider { get; set; } = "Local";

    /// <summary>Query (signed URL policy appended by hls.js to every request) or Cookie (needs a custom domain).</summary>
    public string GrantMode { get; set; } = "Query";

    public int GrantMinutes { get; set; } = 10;
    public string? CloudFrontDomain { get; set; }
    public string? CloudFrontKeyPairId { get; set; }
    public string? PrivateKeyParameterName { get; set; }

    /// <summary>Development only: the PEM on disk instead of SSM.</summary>
    public string? PrivateKeyFile { get; set; }

    public string Region { get; set; } = "ap-southeast-1";

    /// <summary>Cookie mode: the parent domain shared by the UI and the playback host (e.g. .example.com).</summary>
    public string? CookieDomain { get; set; }

    /// <summary>Local mode: public base URL of this Recorder (the browser loads HLS from it).</summary>
    public string LocalPublicBaseUrl { get; set; } = "";
}

/// <param name="Query">Appended by the player to every playlist and chunk request (query mode).</param>
/// <param name="Cookies">Set on the playback domain (cookie mode).</param>
public sealed record PlaybackGrant(string Mode, string MasterUrl, string? Query, IReadOnlyDictionary<string, string>? Cookies, DateTimeOffset ExpiresAtUtc);

/// <summary>Grants short-lived access to one asset's folder (its playlists and chunks), nothing else.</summary>
public interface IPlaybackSigner
{
    Task<PlaybackGrant> GrantAsync(string outputPrefix, string masterKey, DateTimeOffset expires, CancellationToken cancellationToken);
}

/// <summary>Local provider: HMAC over (prefix, expiry), checked by <see cref="LocalPlaybackEndpoint"/>.</summary>
public sealed class LocalPlaybackSigner(IOptions<PlaybackOptions> options, EvidenceStorageOptions storage) : IPlaybackSigner
{
    public const string Path = "/api/evidence/local-playback/";

    public Task<PlaybackGrant> GrantAsync(string outputPrefix, string masterKey, DateTimeOffset expires, CancellationToken cancellationToken)
    {
        var exp = expires.ToUnixTimeSeconds();
        var query = $"prefix={Uri.EscapeDataString(outputPrefix)}&exp={exp}&sig={Sign(outputPrefix, exp)}";
        var baseUrl = string.IsNullOrEmpty(options.Value.LocalPublicBaseUrl) ? storage.LocalPublicBaseUrl : options.Value.LocalPublicBaseUrl;
        return Task.FromResult(new PlaybackGrant("query", $"{baseUrl.TrimEnd('/')}{Path}{masterKey}", query, null, expires));
    }

    public bool Verify(string key, string prefix, long exp, string sig) =>
        key.StartsWith(prefix, StringComparison.Ordinal) && !key.Contains("..", StringComparison.Ordinal)
        && DateTimeOffset.FromUnixTimeSeconds(exp) > DateTimeOffset.UtcNow
        && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Sign(prefix, exp)), Encoding.ASCII.GetBytes(sig));

    private string Sign(string prefix, long exp)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes("playback\n" + storage.LocalSigningKey));
        return Convert.ToHexStringLower(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{prefix}\n{exp}")));
    }
}

/// <summary>
/// CloudFront private content (spec §9.5): a custom policy on the asset's folder (wildcard), signed with the Evidence
/// key group's private key, read from SSM SecureString (never from configuration files).
/// </summary>
public sealed class CloudFrontPlaybackSigner(IOptions<PlaybackOptions> options, IOptions<EvidenceAwsOptions> aws) : IPlaybackSigner
{
    private string? _privateKey;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public async Task<PlaybackGrant> GrantAsync(string outputPrefix, string masterKey, DateTimeOffset expires, CancellationToken cancellationToken)
    {
        var o = options.Value;
        var domain = o.CloudFrontDomain ?? throw new InvalidOperationException($"{PlaybackOptions.SectionName}:CloudFrontDomain is required.");
        var keyPair = o.CloudFrontKeyPairId ?? throw new InvalidOperationException($"{PlaybackOptions.SectionName}:CloudFrontKeyPairId is required.");
        var key = await PrivateKeyAsync(cancellationToken);
        var resource = $"https://{domain}/{outputPrefix}*";
        var master = $"https://{domain}/{masterKey}";
        if (string.Equals(o.GrantMode, "Cookie", StringComparison.OrdinalIgnoreCase))
        {
            var cookies = AmazonCloudFrontCookieSigner.GetCookiesForCustomPolicy(resource, new StringReader(key), keyPair,
                expires.UtcDateTime, DateTime.UtcNow.AddMinutes(-1), "0.0.0.0/0");
            return new PlaybackGrant("cookie", master, null, new Dictionary<string, string>
            {
                [cookies.Policy.Key] = cookies.Policy.Value,
                [cookies.Signature.Key] = cookies.Signature.Value,
                [cookies.KeyPairId.Key] = cookies.KeyPairId.Value
            }, expires);
        }

        // Custom policy on the folder (wildcard): one grant covers the master, the renditions and every chunk.
        var policy = AmazonCloudFrontUrlSigner.BuildPolicyForSignedUrl(resource, expires.UtcDateTime, null, DateTime.UtcNow.AddMinutes(-1));
        var signed = AmazonCloudFrontUrlSigner.SignUrl(resource, keyPair, new StringReader(key), policy);
        var query = signed[(signed.IndexOf('?') + 1)..];
        return new PlaybackGrant("query", master, query, null, expires);
    }

    /// <summary>
    /// The AWS SDK's CloudFront signers read only PKCS#1 ("BEGIN RSA PRIVATE KEY"); <c>openssl genpkey</c> (our key
    /// script) writes PKCS#8 ("BEGIN PRIVATE KEY"), and the SDK then fails with "Invalid RSA Private Key" on every grant
    /// (found by the AWS replay E2E, 2026-11-21). Either form is accepted and handed over as PKCS#1.
    /// </summary>
    internal static string ToPkcs1Pem(string pem)
    {
        // A value pasted with literal "\n" escapes (SSM console) is accepted too.
        var text = pem.Replace("\\n", "\n").Replace("\r\n", "\n").Trim();
        using var rsa = RSA.Create();
        rsa.ImportFromPem(text);
        return rsa.ExportRSAPrivateKeyPem();
    }

    private async Task<string> PrivateKeyAsync(CancellationToken cancellationToken)
    {
        if (_privateKey is not null)
        {
            return _privateKey;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            var o = options.Value;
            if (!string.IsNullOrWhiteSpace(o.PrivateKeyFile))
            {
                _privateKey = ToPkcs1Pem(await File.ReadAllTextAsync(o.PrivateKeyFile, cancellationToken));
            }
            else
            {
                var region = RegionEndpoint.GetBySystemName(o.Region);
                var credentials = aws.Value.Credentials();
                using var ssm = credentials is null
                    ? new AmazonSimpleSystemsManagementClient(region)
                    : new AmazonSimpleSystemsManagementClient(credentials, region);
                var parameter = await ssm.GetParameterAsync(new GetParameterRequest
                {
                    Name = o.PrivateKeyParameterName ?? throw new InvalidOperationException($"{PlaybackOptions.SectionName}:PrivateKeyParameterName is required."),
                    WithDecryption = true
                }, cancellationToken);
                _privateKey = ToPkcs1Pem(parameter.Parameter.Value);
            }

            return _privateKey;
        }
        finally
        {
            _gate.Release();
        }
    }
}
