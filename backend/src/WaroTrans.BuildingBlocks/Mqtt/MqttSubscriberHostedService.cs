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
    RobotIngressGate ingressGate,
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

                var builder = MqttConnection.Configure(new MqttClientOptionsBuilder(), mqtt, MqttConnection.SubscriberRole);

                await client.ConnectAsync(builder.Build(), stoppingToken).ConfigureAwait(false);

                foreach (var batch in SubscriptionBatches(mqtt.TopicPrefix))
                {
                    var subscribe = factory.CreateSubscribeOptionsBuilder();
                    foreach (var (filter, qos) in batch)
                    {
                        subscribe.WithTopicFilter(filter, qos);
                    }

                    var result = await client.SubscribeAsync(subscribe.Build(), stoppingToken).ConfigureAwait(false);
                    var refused = result.Items
                        .Where(i => i.ResultCode > MqttClientSubscribeResultCode.GrantedQoS2)
                        .Select(i => $"{i.TopicFilter.Topic} ({i.ResultCode})")
                        .ToList();
                    if (refused.Count > 0)
                    {
                        // A refused uplink filter means silently lost ACK/RESULTs: fail loudly and retry.
                        throw new InvalidOperationException($"MQTT broker refused subscriptions: {string.Join(", ", refused)}");
                    }
                }
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

    /// <summary>AWS IoT Core accepts at most 8 topic filters per SUBSCRIBE and drops the connection otherwise.</summary>
    public const int MaxFiltersPerSubscribe = 8;

    /// <summary>
    /// The robot uplink filters, in SUBSCRIBE packets of at most <see cref="MaxFiltersPerSubscribe"/>.
    /// The robot publishes the reliable ones at QoS 1; a QoS 0 subscription downgrades delivery to at-most-once, and a
    /// lost RESULT leaves the Job step EXECUTING (there is no execution timeout after ACK). Heartbeat, telemetry and
    /// health stay QoS 0: they are periodic and superseded by the next sample.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<(string Filter, MqttQualityOfServiceLevel Qos)>> SubscriptionBatches(string prefix)
    {
        const MqttQualityOfServiceLevel reliable = MqttQualityOfServiceLevel.AtLeastOnce;
        const MqttQualityOfServiceLevel sample = MqttQualityOfServiceLevel.AtMostOnce;
        (string, MqttQualityOfServiceLevel)[] all =
        [
            (RobotMqttTopics.HeartbeatFilter(prefix), sample),
            (RobotMqttTopics.TelemetryFilter(prefix), sample),
            (RobotMqttTopics.CommandAckFilter(prefix), reliable),
            (RobotMqttTopics.CommandResultFilter(prefix), reliable),
            (RobotMqttTopics.InteractionConfirmFilter(prefix), reliable),
            (RobotMqttTopics.TrafficProgressFilter(prefix), reliable),
            (RobotMqttTopics.TrafficPlanFilter(prefix), reliable),
            (RobotMqttTopics.AuthorityStateFilter(prefix), reliable),
            (RobotMqttTopics.HealthFilter(prefix), sample),
        ];
        return all.Chunk(MaxFiltersPerSubscribe).Select(c => (IReadOnlyList<(string, MqttQualityOfServiceLevel)>)c).ToList();
    }

    private async Task OnMessageAsync(MqttApplicationMessageReceivedEventArgs e, CancellationToken cancellationToken)
    {
        if (!ingressGate.IsActive)
        {
            return; // standby host: the coordinator lease holder handles robot uplink
        }

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

        // Messages are handled one at a time: a slow handler delays every robot's heartbeat behind it (false OFFLINE).
        var started = System.Diagnostics.Stopwatch.GetTimestamp();
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
                case RobotMqttTopics.HealthSuffix:
                    var health = JsonSerializer.Deserialize<RobotHealthMessage>(payload, JsonOptions)
                                 ?? throw new InvalidOperationException($"Invalid health JSON on {topic}");
                    health.RobotCode = MatchTopicRobotCode(health.RobotCode, robotCodeFromTopic);
                    await ingress.HandleHealthAsync(health, cancellationToken).ConfigureAwait(false);
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
        finally
        {
            var elapsed = System.Diagnostics.Stopwatch.GetElapsedTime(started);
            if (elapsed > TimeSpan.FromMilliseconds(500))
            {
                logger.LogWarning("Slow MQTT handler {Kind} for {RobotCode}: {ElapsedMs:F0} ms", kind, robotCodeFromTopic,
                    elapsed.TotalMilliseconds);
            }
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
