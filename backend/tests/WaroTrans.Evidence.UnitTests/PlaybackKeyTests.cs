using System.Security.Cryptography;
using Amazon.CloudFront;
using WaroTrans.Evidence.Recorder.Features.Playback;

namespace WaroTrans.Evidence.UnitTests;

/// <summary>
/// The CloudFront key in SSM is written by openssl genpkey (PKCS#8); the AWS SDK signer reads PKCS#1 only. Found by the
/// AWS replay E2E (2026-11-21): every playback grant failed with "Invalid RSA Private Key".
/// </summary>
public sealed class PlaybackKeyTests
{
    [Fact]
    public void A_pkcs8_key_is_handed_to_the_cloudfront_signer_as_pkcs1_and_signs()
    {
        using var rsa = RSA.Create(2048);
        var pkcs8 = rsa.ExportPkcs8PrivateKeyPem();
        Assert.StartsWith("-----BEGIN PRIVATE KEY-----", pkcs8);

        var pkcs1 = CloudFrontPlaybackSigner.ToPkcs1Pem(pkcs8);

        Assert.StartsWith("-----BEGIN RSA PRIVATE KEY-----", pkcs1);
        var resource = "https://d111111abcdef8.cloudfront.net/playback/a/*";
        var policy = AmazonCloudFrontUrlSigner.BuildPolicyForSignedUrl(resource, DateTime.UtcNow.AddMinutes(10), null, DateTime.UtcNow.AddMinutes(-1));
        var signed = AmazonCloudFrontUrlSigner.SignUrl(resource, "K1TESTKEYPAIR", new StringReader(pkcs1), policy);
        Assert.Contains("Signature=", signed);
    }

    [Fact]
    public void A_pkcs1_key_and_one_pasted_with_escaped_newlines_are_accepted_too()
    {
        using var rsa = RSA.Create(2048);
        var pkcs1 = rsa.ExportRSAPrivateKeyPem();
        var escaped = pkcs1.Replace("\n", "\\n");

        Assert.Equal(pkcs1.Trim(), CloudFrontPlaybackSigner.ToPkcs1Pem(pkcs1).Trim());
        Assert.Equal(pkcs1.Trim(), CloudFrontPlaybackSigner.ToPkcs1Pem(escaped).Trim());
    }
}
