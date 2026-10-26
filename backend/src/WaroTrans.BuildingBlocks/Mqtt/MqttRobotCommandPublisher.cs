using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.BuildingBlocks.Options;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// Publishes robot commands (QoS1), teleop (QoS0), and HUMAN_INTERACTION arming/result (QoS1)
/// on one reconnecting client.
/// </summary>
public sealed class MqttRobotCommandPublisher
    : IMqttRobotCommandPublisher, IMqttRobotTeleopPublisher, IMqttRobotInteractionPublisher, IAsyncDisposable
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

    public async Task PublishAsync(RobotTeleopMessage message, CancellationToken cancellationToken = default)
    {
        var topic = RobotMqttTopics.Teleop(_options.Value.TopicPrefix, message.RobotCode);
        var json = JsonSerializer.Serialize(message, JsonOptions);

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var client = await EnsureConnectedAsync(cancellationToken).ConfigureAwait(false);
            // QoS 0: a lost setpoint is replaced by the next one (~200 ms); the robot deadman covers gaps.
            var appMessage = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(json)
                .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtMostOnce)
                .Build();

            await client.PublishAsync(appMessage, cancellationToken).ConfigureAwait(false);
            _logger.LogDebug(
                "Published MQTT teleop robot={RobotCode} linear={Linear} angular={Angular}",
                message.RobotCode,
                message.Linear,
                message.Angular);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task PublishRequestAsync(
        RobotInteractionRequestMessage message,
        CancellationToken cancellationToken = default)
    {
        var topic = RobotMqttTopics.InteractionRequest(_options.Value.TopicPrefix, message.RobotCode);
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
                "Published MQTT interaction_request {InteractionType} jobStepId={JobStepId} robot={RobotCode}",
                message.InteractionType,
                message.JobStepId,
                message.RobotCode);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task PublishResultAsync(
        RobotInteractionResultMessage message,
        CancellationToken cancellationToken = default)
    {
        var topic = RobotMqttTopics.InteractionResult(_options.Value.TopicPrefix, message.RobotCode);
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
                "Published MQTT interaction_result accepted={Accepted} reason={ReasonCode} jobStepId={JobStepId} robot={RobotCode}",
                message.Accepted,
                message.ReasonCode,
                message.JobStepId,
                message.RobotCode);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Opens the connection ahead of the first command (called at startup), so a command never pays for it while its
    /// ACK timeout runs. Throws when the broker cannot be reached within ConnectTimeoutSeconds.
    /// </summary>
    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await EnsureConnectedAsync(cancellationToken).ConfigureAwait(false);
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
        var connectTimeout = TimeSpan.FromSeconds(Math.Max(1, mqtt.ConnectTimeoutSeconds));
        var client = _factory.CreateMqttClient();
        var builder = new MqttClientOptionsBuilder()
            .WithTcpServer(mqtt.Host, mqtt.Port)
            .WithClientId($"{mqtt.ClientId}-cmd-pub-{Environment.ProcessId}")
            .WithTimeout(connectTimeout)
            .WithCleanSession();

        if (!string.IsNullOrWhiteSpace(mqtt.Username))
        {
            builder.WithCredentials(mqtt.Username, mqtt.Password);
        }

        // Bounded: a broker that does not answer (e.g. "localhost" → ::1 while it listens on IPv4 only) fails the
        // publish after connectTimeout instead of holding every queued command for ~21 s.
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(connectTimeout);
        try
        {
            await client.ConnectAsync(builder.Build(), timeout.Token).ConfigureAwait(false);
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            client.Dispose();
            _logger.LogWarning(ex, "MQTT command publisher could not connect to {Host}:{Port}", mqtt.Host, mqtt.Port);
            throw new MqttBrokerUnavailableException(
                $"MQTT broker {mqtt.Host}:{mqtt.Port} did not accept a connection within {connectTimeout.TotalSeconds:0} s.");
        }

        _client = client;
        _logger.LogInformation("MQTT command publisher connected to {Host}:{Port}", mqtt.Host, mqtt.Port);
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
