using System.Text.Json;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Protocol;
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

                // The robot publishes these at QoS 1; a QoS 0 subscription downgrades delivery to at-most-once,
                // and a lost RESULT leaves the Job step EXECUTING (there is no execution timeout after ACK).
                // Heartbeat/telemetry stay QoS 0: they are periodic and superseded by the next sample.
                const MqttQualityOfServiceLevel reliable = MqttQualityOfServiceLevel.AtLeastOnce;
                var subscribeOptions = factory.CreateSubscribeOptionsBuilder()
                    .WithTopicFilter(RobotMqttTopics.HeartbeatFilter(mqtt.TopicPrefix))
                    .WithTopicFilter(RobotMqttTopics.TelemetryFilter(mqtt.TopicPrefix))
                    .WithTopicFilter(RobotMqttTopics.CommandAckFilter(mqtt.TopicPrefix), reliable)
                    .WithTopicFilter(RobotMqttTopics.CommandResultFilter(mqtt.TopicPrefix), reliable)
                    .WithTopicFilter(RobotMqttTopics.InteractionConfirmFilter(mqtt.TopicPrefix), reliable)
                    .WithTopicFilter(RobotMqttTopics.TrafficProgressFilter(mqtt.TopicPrefix), reliable)
                    .WithTopicFilter(RobotMqttTopics.TrafficPlanFilter(mqtt.TopicPrefix), reliable)
                    .WithTopicFilter(RobotMqttTopics.AuthorityStateFilter(mqtt.TopicPrefix), reliable)
                    .Build();

                await client.SubscribeAsync(subscribeOptions, stoppingToken).ConfigureAwait(false);
                logger.LogInformation(
                    "MQTT subscribed to robot uplink topics (incl. traffic_progress/traffic_plan/authority_state) on {Host}:{Port}",
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

        // Backend never consumes its own downlink topics.
        if (kind is RobotMqttTopics.CommandSuffix
            or RobotMqttTopics.InteractionRequestSuffix
            or RobotMqttTopics.InteractionResultSuffix)
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
                case RobotMqttTopics.InteractionConfirmSuffix:
                    await HandleInteractionConfirmAsync(scope, ingress, payload, topic, robotCodeFromTopic, cancellationToken)
                        .ConfigureAwait(false);
                    break;
                case RobotMqttTopics.TrafficProgressSuffix:
                    await HandleTrafficProgressAsync(ingress, payload, topic, robotCodeFromTopic, cancellationToken)
                        .ConfigureAwait(false);
                    break;
                case RobotMqttTopics.TrafficPlanSuffix:
                    await HandleTrafficPlanAsync(ingress, payload, topic, robotCodeFromTopic, cancellationToken)
                        .ConfigureAwait(false);
                    break;
                case RobotMqttTopics.AuthorityStateSuffix:
                    await HandleAuthorityStateAsync(ingress, payload, topic, robotCodeFromTopic, cancellationToken)
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

        message.RobotCode = MatchTopicRobotCode(message.RobotCode, robotCodeFromTopic);

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

        message.RobotCode = MatchTopicRobotCode(message.RobotCode, robotCodeFromTopic);

        var validator = scope.ServiceProvider.GetRequiredService<IValidator<RobotCommandResultMessage>>();
        await validator.ValidateAndThrowAsync(message, cancellationToken).ConfigureAwait(false);
        await ingress.HandleCommandResultAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static async Task HandleInteractionConfirmAsync(
        AsyncServiceScope scope,
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<RobotInteractionConfirmMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid interaction_confirm JSON on {topic}");
        }

        message.RobotCode = MatchTopicRobotCode(message.RobotCode, robotCodeFromTopic);

        var validator = scope.ServiceProvider.GetRequiredService<IValidator<RobotInteractionConfirmMessage>>();
        await validator.ValidateAndThrowAsync(message, cancellationToken).ConfigureAwait(false);
        await ingress.HandleInteractionConfirmAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static async Task HandleTrafficProgressAsync(
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<TrafficProgressMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid traffic_progress JSON on {topic}");
        }

        message.RobotCode = MatchTopicRobotCode(message.RobotCode, robotCodeFromTopic);

        await ingress.HandleTrafficProgressAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static async Task HandleTrafficPlanAsync(
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<TrafficPlanProposeMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid traffic_plan JSON on {topic}");
        }

        message.RobotCode = MatchTopicRobotCode(message.RobotCode, robotCodeFromTopic);

        await ingress.HandleTrafficPlanAsync(message, cancellationToken).ConfigureAwait(false);
    }

    private static async Task HandleAuthorityStateAsync(
        IRobotMqttIngress ingress,
        string payload,
        string topic,
        string robotCodeFromTopic,
        CancellationToken cancellationToken)
    {
        var message = JsonSerializer.Deserialize<AuthorityStateMessage>(payload, JsonOptions);
        if (message is null)
        {
            throw new InvalidOperationException($"Invalid authority_state JSON on {topic}");
        }

        message.RobotCode = MatchTopicRobotCode(message.RobotCode, robotCodeFromTopic);

        await ingress.HandleAuthorityStateAsync(message, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Uplinks that change command, traffic or job state must come from the robot whose topic they arrive on.
    /// An empty payload robotCode takes the topic's; a different one is rejected.
    /// </summary>
    public static string MatchTopicRobotCode(string? payloadRobotCode, string robotCodeFromTopic)
    {
        if (string.IsNullOrWhiteSpace(payloadRobotCode))
        {
            return robotCodeFromTopic;
        }

        if (!string.Equals(payloadRobotCode, robotCodeFromTopic, StringComparison.Ordinal))
        {
            throw new ValidationException(
                "RobotCode in payload must match the topic robotCode.",
                [
                    new FluentValidation.Results.ValidationFailure(
                        "RobotCode",
                        $"Topic robotCode '{robotCodeFromTopic}' != payload '{payloadRobotCode}'.")
                ]);
        }

        return payloadRobotCode;
    }
}
