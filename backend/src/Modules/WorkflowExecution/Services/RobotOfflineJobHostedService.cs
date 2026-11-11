using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.WorkflowExecution.Execution;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>FL-06: a Job whose robot went silent with no command in flight would otherwise stay RUNNING for ever.</summary>
public sealed class RobotOfflineJobHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<RobotOfflineJobHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                try
                {
                    await using var scope = scopeFactory.CreateAsyncScope();
                    await scope.ServiceProvider.GetRequiredService<JobExecutionEngine>().HandleOfflineRobotsAsync(stoppingToken).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning(ex, "Offline robot scan failed");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }
}
