using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.WorkflowExecution.Execution;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>WFX-01: wakes WAIT.DURATION steps once their stored deadline has passed (durable across restarts).</summary>
public sealed class WaitStepWakeupHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<WaitStepWakeupHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var engine = scope.ServiceProvider.GetRequiredService<JobExecutionEngine>();
                var n = await engine.WakeDueWaitStepsAsync(stoppingToken).ConfigureAwait(false);
                if (n > 0)
                {
                    logger.LogInformation("Woke {Count} WAIT step(s)", n);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "WAIT wake-up scan failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
