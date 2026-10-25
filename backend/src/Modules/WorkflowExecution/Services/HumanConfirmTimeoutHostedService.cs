using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.WorkflowExecution.Execution;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>Polls WAITING HUMAN_INTERACTION steps and escalates timeouts without releasing holds.</summary>
public sealed class HumanConfirmTimeoutHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<HumanConfirmTimeoutHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var engine = scope.ServiceProvider.GetRequiredService<JobExecutionEngine>();
                var n = await engine.EscalateHumanConfirmTimeoutsAsync(stoppingToken).ConfigureAwait(false);
                if (n > 0)
                {
                    logger.LogInformation("Escalated {Count} HUMAN confirm timeout(s)", n);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Human confirm timeout scan failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
