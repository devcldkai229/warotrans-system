using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>Runs <see cref="StalledWorkChecker"/> on a timer so waiting work is noticed without anybody looking.</summary>
public sealed class StalledWorkMonitorHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<StalledWorkOptions> options,
    ILogger<StalledWorkMonitorHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(1, options.Value.CheckIntervalSeconds));
        using var timer = new PeriodicTimer(interval);

        try
        {
            // The first check is one interval after start-up, so a restart does not fire a burst straight away.
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await using var scope = scopeFactory.CreateAsyncScope();
                    var raised = await scope.ServiceProvider
                        .GetRequiredService<StalledWorkChecker>()
                        .CheckAsync(stoppingToken);
                    if (raised > 0)
                    {
                        logger.LogDebug("Stalled work check raised {Count} event(s)", raised);
                    }
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Stalled work check failed");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // shutting down
        }
    }
}
