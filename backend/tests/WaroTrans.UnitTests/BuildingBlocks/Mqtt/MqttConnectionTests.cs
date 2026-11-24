using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using MQTTnet;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Options;

namespace WaroTrans.UnitTests.BuildingBlocks.Mqtt;

public class MqttConnectionTests
{
    [Fact]
    public void On_a_laptop_the_client_ids_carry_the_process_id()
    {
        var mqtt = new MqttOptions { ClientId = "warotrans-host" };

        Assert.Equal("warotrans-host-42", MqttConnection.ClientId(mqtt, MqttConnection.SubscriberRole, 42));
        Assert.Equal("warotrans-host-cmd-pub-42", MqttConnection.ClientId(mqtt, MqttConnection.PublisherRole, 42));
    }

    [Fact]
    public void For_iot_core_the_client_ids_are_fixed_so_the_policy_can_name_them()
    {
        var mqtt = new MqttOptions { ClientId = "warotrans-host", ClientIdIncludesProcessId = false };

        Assert.Equal("warotrans-host", MqttConnection.ClientId(mqtt, MqttConnection.SubscriberRole, 1));
        Assert.Equal("warotrans-host-cmd-pub", MqttConnection.ClientId(mqtt, MqttConnection.PublisherRole, 1));
    }

    [Fact]
    public void Without_tls_the_connection_is_plain_tcp()
    {
        var options = MqttConnection.Configure(new MqttClientOptionsBuilder(), new MqttOptions(), MqttConnection.SubscriberRole).Build();

        var tcp = Assert.IsType<MqttClientTcpOptions>(options.ChannelOptions);
        Assert.False(tcp.TlsOptions.UseTls);
    }

    [Fact]
    public void With_tls_the_thing_certificate_and_its_key_are_presented()
    {
        var (certPem, keyPem, _) = SelfSigned("CN=warotrans-host");
        var mqtt = new MqttOptions
        {
            Host = "example-ats.iot.ap-southeast-1.amazonaws.com",
            Port = 8883,
            UseTls = true,
            ClientIdIncludesProcessId = false,
            ClientCertificatePem = certPem,
            // as an environment variable may carry it
            ClientPrivateKeyPem = keyPem.Replace("\n", "\\n", StringComparison.Ordinal),
        };

        var options = MqttConnection.Configure(new MqttClientOptionsBuilder(), mqtt, MqttConnection.PublisherRole).Build();

        Assert.Equal("warotrans-host-cmd-pub", options.ClientId);
        var tcp = Assert.IsType<MqttClientTcpOptions>(options.ChannelOptions);
        Assert.True(tcp.TlsOptions.UseTls);
        var presented = Assert.Single(tcp.TlsOptions.ClientCertificatesProvider!.GetCertificates().Cast<X509Certificate2>());
        Assert.True(presented.HasPrivateKey);
        Assert.Equal("CN=warotrans-host", presented.Subject);
    }

    [Fact]
    public void A_certificate_without_its_key_is_refused_at_start()
    {
        var (certPem, _, _) = SelfSigned("CN=x");
        var mqtt = new MqttOptions { UseTls = true, ClientCertificatePem = certPem };

        Assert.Throws<InvalidOperationException>(() => MqttConnection.LoadClientCertificate(mqtt));
    }

    [Fact]
    public void A_broker_certificate_is_trusted_only_when_it_chains_to_the_configured_ca()
    {
        using var caKey = RSA.Create(2048);
        var caRequest = new CertificateRequest("CN=Test CA", caKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        caRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        using var ca = caRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));

        using var brokerKey = RSA.Create(2048);
        var brokerRequest = new CertificateRequest("CN=broker", brokerKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var broker = brokerRequest.Create(ca, DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(10), [1, 2, 3, 4]);
        var (_, _, stranger) = SelfSigned("CN=broker");

        Assert.True(MqttConnection.ValidateAgainst(ca, broker, SslPolicyErrors.RemoteCertificateChainErrors));
        Assert.False(MqttConnection.ValidateAgainst(ca, stranger, SslPolicyErrors.RemoteCertificateChainErrors));
        Assert.False(MqttConnection.ValidateAgainst(ca, broker, SslPolicyErrors.RemoteCertificateNameMismatch));
        Assert.False(MqttConnection.ValidateAgainst(ca, null, SslPolicyErrors.RemoteCertificateNotAvailable));
    }

    [Fact]
    public void Uplink_subscriptions_fit_aws_iot_core_s_eight_filters_per_subscribe_and_keep_their_qos()
    {
        var batches = MqttSubscriberHostedService.SubscriptionBatches("warotrans/v1");

        Assert.All(batches, b => Assert.InRange(b.Count, 1, MqttSubscriberHostedService.MaxFiltersPerSubscribe));
        var all = batches.SelectMany(b => b).ToDictionary(x => x.Filter, x => x.Qos);
        Assert.Equal(12, all.Count);
        // The live costmap is a periodic view sample: at most once.
        Assert.Equal(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtMostOnce, all["warotrans/v1/robots/+/costmap"]);
        // Map building: the live view is a sample, the finished map's chunks must all arrive.
        Assert.Equal(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtMostOnce, all["warotrans/v1/robots/+/mapping"]);
        Assert.Equal(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce, all["warotrans/v1/robots/+/mapping_upload"]);
        Assert.Equal(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce, all["warotrans/v1/robots/+/command_result"]);
        Assert.Equal(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtMostOnce, all["warotrans/v1/robots/+/heartbeat"]);
    }

    private static (string CertPem, string KeyPem, X509Certificate2 Certificate) SelfSigned(string subject)
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest(subject, key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        return (certificate.ExportCertificatePem(), key.ExportPkcs8PrivateKeyPem(), certificate);
    }
}
