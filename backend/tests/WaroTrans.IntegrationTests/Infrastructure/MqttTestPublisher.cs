using System.Text.Json;
using MQTTnet;
using WaroTrans.BuildingBlocks.Mqtt;

namespace WaroTrans.IntegrationTests.Infrastructure;

public static class MqttTestPublisher
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static async Task PublishAsync(string topic, object payload, CancellationToken cancellationToken = default)
    {
        var factory = new MqttClientFactory();
        using var client = factory.CreateMqttClient();
        var options = new MqttClientOptionsBuilder()
            .WithTcpServer("localhost", 1883)
            .WithClientId($"warotrans-it-pub-{Guid.NewGuid():N}")
            .WithCleanSession()
            .Build();

        await client.ConnectAsync(options, cancellationToken);
        try
        {
            var json = JsonSerializer.Serialize(payload, JsonOptions);
            var message = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(json)
                .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
                .Build();
            await client.PublishAsync(message, cancellationToken);
        }
        finally
        {
            await client.DisconnectAsync(cancellationToken: CancellationToken.None);
        }
    }

    public static Task PublishHeartbeatAsync(string robotCode, Guid bootId, long sequence, CancellationToken cancellationToken = default) =>
        PublishAsync(
            RobotMqttTopics.Heartbeat("warotrans/v1", robotCode),
            new
            {
                schemaVersion = 1,
                messageId = Guid.NewGuid(),
                robotCode,
                bootId,
                sequence,
                sentAt = DateTimeOffset.UtcNow
            },
            cancellationToken);

    public static Task PublishTelemetryAsync(
        string robotCode,
        Guid bootId,
        long sequence,
        double x,
        double y,
        double yaw,
        string navigationStatus = "IDLE",
        string localizationStatus = "LOCALIZED",
        CancellationToken cancellationToken = default) =>
        PublishAsync(
            RobotMqttTopics.Telemetry("warotrans/v1", robotCode),
            new
            {
                schemaVersion = 1,
                messageId = Guid.NewGuid(),
                robotCode,
                bootId,
                sequence,
                sentAt = DateTimeOffset.UtcNow,
                mapVersionCode = "MAP-TEST-V001",
                pose = new { x, y, yaw },
                batteryPercent = 88.5m,
                navigationStatus,
                localizationStatus,
                linearVelocity = 0.2,
                angularVelocity = 0.01,
                currentCommandId = (Guid?)null,
                errorCode = (string?)null
            },
            cancellationToken);
}
