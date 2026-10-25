using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>
/// Connects the command publisher at startup (retrying with back-off until the broker answers), so the first robot
/// command after a restart is sent at once instead of opening the connection while its ACK timeout runs.
/// Skipped when the publisher is replaced (integration tests register a capturing fake).
/// </summary>
public sealed class MqttCommandPublisherWarmupHostedService(
    IMqttRobotCommandPublisher publisher,
    ILogger<MqttCommandPublisherWarmupHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (publisher is not MqttRobotCommandPublisher mqtt)
        {
            return;
        }

        var delay = TimeSpan.FromSeconds(2);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await mqtt.ConnectAsync(stoppingToken).ConfigureAwait(false);
                return;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                // A command issued meanwhile still connects on demand; this only keeps trying in the background.
                logger.LogWarning("MQTT command publisher warm-up failed ({Reason}); retrying in {Delay} s", ex.Message, delay.TotalSeconds);
            }

            try
            {
                await Task.Delay(delay, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            delay = TimeSpan.FromSeconds(Math.Min(30, delay.TotalSeconds * 2));
        }
    }
}
