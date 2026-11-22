using System.Net.Security;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using MQTTnet;
using WaroTrans.BuildingBlocks.Options;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// One place that turns <see cref="MqttOptions"/> into a broker connection, for the subscriber and the command
/// publisher alike: plain TCP for the local Mosquitto, TLS with an X.509 client certificate for AWS IoT Core.
/// </summary>
public static class MqttConnection
{
    public const string SubscriberRole = "";
    public const string PublisherRole = "cmd-pub";

    /// <summary>The client id of one connection: fixed for IoT Core, with the process id on a laptop.</summary>
    public static string ClientId(MqttOptions mqtt, string role, int processId)
    {
        var id = string.IsNullOrEmpty(role) ? mqtt.ClientId : $"{mqtt.ClientId}-{role}";
        return mqtt.ClientIdIncludesProcessId ? $"{id}-{processId}" : id;
    }

    public static MqttClientOptionsBuilder Configure(MqttClientOptionsBuilder builder, MqttOptions mqtt, string role)
    {
        builder
            .WithTcpServer(mqtt.Host, mqtt.Port)
            .WithClientId(ClientId(mqtt, role, Environment.ProcessId))
            .WithCleanSession();

        if (!string.IsNullOrWhiteSpace(mqtt.Username))
        {
            builder.WithCredentials(mqtt.Username, mqtt.Password);
        }

        if (mqtt.UseTls)
        {
            var clientCertificate = LoadClientCertificate(mqtt);
            var ca = LoadCa(mqtt);
            builder.WithTlsOptions(tls =>
            {
                tls.UseTls()
                    .WithSslProtocols(SslProtocols.Tls12 | SslProtocols.Tls13);
                if (clientCertificate is not null)
                {
                    tls.WithClientCertificates([clientCertificate]);
                }

                if (ca is not null)
                {
                    tls.WithCertificateValidationHandler(args => ValidateAgainst(ca, args.Certificate, args.SslPolicyErrors));
                }
            });
        }

        return builder;
    }

    /// <summary>The certificate with its key, or null when none is configured (a TLS broker without client auth).</summary>
    public static X509Certificate2? LoadClientCertificate(MqttOptions mqtt)
    {
        var certPem = Read(mqtt.ClientCertificatePem, mqtt.ClientCertificateFile);
        var keyPem = Read(mqtt.ClientPrivateKeyPem, mqtt.ClientPrivateKeyFile);
        if (certPem is null && keyPem is null)
        {
            return null;
        }

        if (certPem is null || keyPem is null)
        {
            throw new InvalidOperationException(
                "Mqtt:UseTls needs both the client certificate and its private key (Mqtt:ClientCertificatePem/File and Mqtt:ClientPrivateKeyPem/File).");
        }

        using var ephemeral = X509Certificate2.CreateFromPem(certPem, keyPem);
        // SslStream on Windows cannot use a key that only lives in memory: round-trip through PKCS#12.
        return X509CertificateLoader.LoadPkcs12(ephemeral.Export(X509ContentType.Pkcs12), null);
    }

    private static X509Certificate2? LoadCa(MqttOptions mqtt)
    {
        var pem = Read(mqtt.CaCertificatePem, mqtt.CaCertificateFile);
        return pem is null ? null : X509Certificate2.CreateFromPem(pem);
    }

    /// <summary>The broker certificate must chain to <paramref name="ca"/> and match the host name.</summary>
    public static bool ValidateAgainst(X509Certificate2 ca, X509Certificate? presented, SslPolicyErrors errors)
    {
        if (presented is null || errors.HasFlag(SslPolicyErrors.RemoteCertificateNameMismatch)
            || errors.HasFlag(SslPolicyErrors.RemoteCertificateNotAvailable))
        {
            return false;
        }

        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(ca);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        using var leaf = new X509Certificate2(presented);
        return chain.Build(leaf);
    }

    private static string? Read(string? pem, string? file)
    {
        if (!string.IsNullOrWhiteSpace(pem))
        {
            // Environment variables may carry the PEM with literal "\n".
            return pem.Contains("\\n", StringComparison.Ordinal) ? pem.Replace("\\n", "\n", StringComparison.Ordinal) : pem;
        }

        return string.IsNullOrWhiteSpace(file) ? null : File.ReadAllText(file);
    }
}
