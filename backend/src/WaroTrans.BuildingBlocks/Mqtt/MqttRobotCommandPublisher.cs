using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.BuildingBlocks.Options;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// Publishes robot commands over MQTT (QoS1). Maintains a reconnecting client.
/// </summary>
public sealed class MqttRobotCommandPublisher : IMqttRobotCommandPublisher, IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly IOptions<MqttOptions> _options;
    private readonly ILogger<MqttRobotCommandPublisher> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly MqttClientFactory _factory = new();
    private IMqttClient? _client;

    public MqttRobotCommandPublisher(
        IOptions<MqttOptions> options,
        ILogger<MqttRobotCommandPublisher> logger)
    {
        _options = options;
        _logger = logger;
    }

    public async Task PublishAsync(RobotCommandMessage message, CancellationToken cancellationToken = default)
    {
        var mqtt = _options.Value;
        var topic = RobotMqttTopics.Command(mqtt.TopicPrefix, message.RobotCode);
        var json = JsonSerializer.Serialize(message, JsonOptions);

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var client = await EnsureConnectedAsync(cancellationToken).ConfigureAwait(false);
            var appMessage = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(json)
                .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                .Build();

            await client.PublishAsync(appMessage, cancellationToken).ConfigureAwait(false);
            _logger.LogInformation(
                "Published MQTT command {CommandType} commandId={CommandId} robot={RobotCode}",
                message.Type,
                message.CommandId,
                message.RobotCode);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<IMqttClient> EnsureConnectedAsync(CancellationToken cancellationToken)
    {
        if (_client is { IsConnected: true })
        {
            return _client;
        }

        if (_client is not null)
        {
            _client.Dispose();
            _client = null;
        }

        var mqtt = _options.Value;
        var client = _factory.CreateMqttClient();
        var builder = new MqttClientOptionsBuilder()
            .WithTcpServer(mqtt.Host, mqtt.Port)
            .WithClientId($"{mqtt.ClientId}-cmd-pub-{Environment.ProcessId}")
            .WithCleanSession();

        if (!string.IsNullOrWhiteSpace(mqtt.Username))
        {
            builder.WithCredentials(mqtt.Username, mqtt.Password);
        }

        await client.ConnectAsync(builder.Build(), cancellationToken).ConfigureAwait(false);
        _client = client;
        return client;
    }

    public async ValueTask DisposeAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_client is not null)
            {
                try
                {
                    if (_client.IsConnected)
                    {
                        await _client.DisconnectAsync().ConfigureAwait(false);
                    }
                }
                catch
                {
                    // ignore
                }

                _client.Dispose();
                _client = null;
            }
        }
        finally
        {
            _gate.Release();
            _gate.Dispose();
        }
    }
}
