using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>FL-07: runs the queue. See <see cref="JobQueueProcessor"/>.</summary>
public sealed class JobQueueHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<JobQueueHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                try
                {
                    await using var scope = scopeFactory.CreateAsyncScope();
                    await scope.ServiceProvider.GetRequiredService<JobQueueProcessor>().TickAsync(stoppingToken).ConfigureAwait(false);
                    var care = scope.ServiceProvider.GetRequiredService<Features.RobotCare.RobotCareService>();
                    await care.RunNextMaintenanceAsync(stoppingToken).ConfigureAwait(false);
                    await care.ReturnIdleRobotsAsync(stoppingToken).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Job queue tick failed");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
