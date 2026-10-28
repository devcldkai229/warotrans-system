using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Active Mode: periodically renews segment authorities so robot SafetySupervisor
/// does not FAULT on <c>authority_loss_timeout_sec</c> while FollowPath is still running.
/// </summary>
public sealed class TrafficAuthorityRenewHostedService(
    ISegmentedTrafficCoordinator coordinator,
    IOptions<TrafficOptions> options,
    ILogger<TrafficAuthorityRenewHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // First delay before any renew so NAVIGATE+authority MQTT is processed first.
            var intervalSec = Math.Clamp(options.Value.AuthorityRenewIntervalSec, 0.5, 10.0);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(intervalSec), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }

            if (options.Value.Mode != TrafficCoordinatorMode.Active)
            {
                continue;
            }

            try
            {
                var n = await coordinator.RenewAllActiveAuthoritiesAsync(stoppingToken).ConfigureAwait(false);
                if (n > 0)
                {
                    logger.LogTrace("Renewed {Count} active traffic authorities", n);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Authority renew tick failed");
            }
        }
    }
}
