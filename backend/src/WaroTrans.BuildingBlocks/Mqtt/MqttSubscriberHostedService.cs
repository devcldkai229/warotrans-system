using System.Text.Json;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.BuildingBlocks.Options;

namespace WaroTrans.BuildingBlocks.Mqtt;

public sealed class MqttSubscriberHostedService(
    IOptions<MqttOptions> options,
    IServiceScopeFactory scopeFactory,
    ILogger<MqttSubscriberHostedService> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var mqtt = options.Value;
        var factory = new MqttClientFactory();

        while (!stoppingToken.IsCancellationRequested)
        {
            IMqttClient? client = null;
            try
            {
                client = factory.CreateMqttClient();
                client.ApplicationMessageReceivedAsync += async e =>
                {
                    await OnMessageAsync(e, stoppingToken).ConfigureAwait(false);
                };

                var builder = new MqttClientOptionsBuilder()
                    .WithTcpServer(mqtt.Host, mqtt.Port)
                    .WithClientId($"{mqtt.ClientId}-{Environment.ProcessId}")
                    .WithCleanSession();

                if (!string.IsNullOrWhiteSpace(mqtt.Username))
                {
                    builder.WithCredentials(mqtt.Username, mqtt.Password);
                }

                await client.ConnectAsync(builder.Build(), stoppingToken).ConfigureAwait(false);

                var subscribeOptions = factory.CreateSubscribeOptionsBuilder()
                    .WithTopicFilter(RobotMqttTopics.HeartbeatFilter(mqtt.TopicPrefix))
                    .WithTopicFilter(RobotMqttTopics.TelemetryFilter(mqtt.TopicPrefix))
                    .WithTopicFilter(RobotMqttTopics.CommandAckFilter(mqtt.TopicPrefix))
                    .WithTopicFilter(RobotMqttTopics.CommandResultFilter(mqtt.TopicPrefix))
                    .Build();

                await client.SubscribeAsync(subscribeOptions, stoppingToken).ConfigureAwait(false);
                logger.LogInformation(
                    "MQTT subscribed to robot heartbeat/telemetry/command_ack/command_result on {Host}:{Port}",
                    mqtt.Host,
                    mqtt.Port);

                while (!stoppingToken.IsCancellationRequested && client.IsConnected)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "MQTT subscriber disconnected or failed; retrying in 3s");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
            finally
            {
                if (client is not null)
                {
                    try
                    {
                        if (client.IsConnected)
                        {
                            await client.DisconnectAsync(cancellationToken: CancellationToken.None)
                                .ConfigureAwait(false);
                        }
                    }
                    catch
                    {
                        // ignore disconnect errors on teardown
                    }

                    client.Dispose();
                }
            }
        }
    }

    private async Task OnMessageAsync(MqttApplicationMessageReceivedEventArgs e, CancellationToken cancellationToken)
    {
        var topic = e.ApplicationMessage.Topic;
        var mqtt = options.Value;
        if (!RobotMqttTopics.TryParse(topic, mqtt.TopicPrefix, out var robotCodeFromTopic, out var kind))
        {
            logger.LogDebug("Ignoring MQTT topic {Topic}", topic);
            return;
        }

        // Backend never consumes its own downlink command topic.
        if (kind == RobotMqttTopics.CommandSuffix)
        {
            return;
        }

        var payload = e.ApplicationMessage.ConvertPayloadToString() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(payload))
        {
            logger.LogWarning("Empty MQTT payload on {Topic}", topic);
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var ingress = scope.ServiceProvider.GetService<IRobotMqttIngress>();
        if (ingress is null)
        {
            logger.LogWarning("IRobotMqttIngress is not registered; dropping MQTT message on {Topic}", topic);
            return;
        }

        try
        {
            switch (kind)
            {
                case RobotMqttTopics.HeartbeatSuffix:
                    await HandleHeartbeatAsync(scope, ingress, payload, topic, robotCodeFromTopic, cancellationToken)
                        .ConfigureAwait(false);
                    break;
                case RobotMqttTopics.TelemetrySuffix:
                    await HandleTelemetryAsync(scope, ingress, payload, topic, robotCodeFromTopic, cancellationToken)
                        .ConfigureAwait(false);
                    break;
                case RobotMqttTopics.CommandAckSuffix:
                    await HandleCommandAckAsync(scope, ingress, payload, topic, robotCodeFromTopic, cancellationToken)
                        .ConfigureAwait(false);
                    break;
                case RobotMqttTopics.CommandResultSuffix:
                    await HandleCommandResultAsync(scope, ingress, payload, topic, robotCodeFromTopic, cancellationToken)
                        .ConfigureAwait(false);
                    break;
            }
        }
        catch (ValidationException vex)
        {
            logger.LogWarning(
                "MQTT payload validation failed on {Topic}: {Errors}",
                topic,
                string.Join("; ", vex.Errors.Select(err => err.ErrorMessage)));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed processing MQTT message on {Topic}", topic);
        }
    }

    private static async Task HandleHeartbeatAsync(
        AsyncServiceScope scope,
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<RobotHeartbeatMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid heartbeat JSON on {topic}");
        }

        if (string.IsNullOrWhiteSpace(message.RobotCode))
        {
            message.RobotCode = robotCodeFromTopic;
        }

        var validator = scope.ServiceProvider.GetRequiredService<IValidator<RobotHeartbeatMessage>>();
        await validator.ValidateAndThrowAsync(message, cancellationToken).ConfigureAwait(false);
        await ingress.HandleHeartbeatAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static async Task HandleTelemetryAsync(
        AsyncServiceScope scope,
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<RobotTelemetryMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid telemetry JSON on {topic}");
        }

        if (string.IsNullOrWhiteSpace(message.RobotCode))
        {
            message.RobotCode = robotCodeFromTopic;
        }

        var validator = scope.ServiceProvider.GetRequiredService<IValidator<RobotTelemetryMessage>>();
        await validator.ValidateAndThrowAsync(message, cancellationToken).ConfigureAwait(false);
        await ingress.HandleTelemetryAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static async Task HandleCommandAckAsync(
        AsyncServiceScope scope,
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<RobotCommandAckMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid command_ack JSON on {topic}");
        }

        if (string.IsNullOrWhiteSpace(message.RobotCode))
        {
            message.RobotCode = robotCodeFromTopic;
        }

        var validator = scope.ServiceProvider.GetRequiredService<IValidator<RobotCommandAckMessage>>();
        await validator.ValidateAndThrowAsync(message, cancellationToken).ConfigureAwait(false);
        await ingress.HandleCommandAckAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static async Task HandleCommandResultAsync(
        AsyncServiceScope scope,
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<RobotCommandResultMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid command_result JSON on {topic}");
        }

        if (string.IsNullOrWhiteSpace(message.RobotCode))
        {
            message.RobotCode = robotCodeFromTopic;
        }

        var validator = scope.ServiceProvider.GetRequiredService<IValidator<RobotCommandResultMessage>>();
        await validator.ValidateAndThrowAsync(message, cancellationToken).ConfigureAwait(false);
        await ingress.HandleCommandResultAsync(message, cancellationToken).ConfigureAwait(false);
    }
}
