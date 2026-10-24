using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Features.IssueNavigateCommand;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Event-driven pump: waits on <see cref="TrafficReadySignal"/> when V1 waiters obtain a grant,
/// then issues NAVIGATE_TO_POSE (MOVE steps stay EXECUTING with pendingTraffic until then).
/// </summary>
public sealed class TrafficGrantHostedService(
    ITrafficCoordinator coordinator,
    TrafficReadySignal readySignal,
    IServiceScopeFactory scopeFactory,
    ILogger<TrafficGrantHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Drain any ready items that arrived before the loop started, then wait for signals.
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken).ConfigureAwait(false);
                await readySignal.WaitAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Traffic grant pump tick failed");
                try
                {
                    await Task.Delay(200, stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        var ready = coordinator.TakeReadyNavigates();
        if (ready.Count == 0)
        {
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var handler = scope.ServiceProvider.GetRequiredService<IssueNavigateCommandHandler>();

        foreach (var grant in ready)
        {
            try
            {
                var route = new RouteGrantPayload
                {
                    GraphHash = grant.GraphHash,
                    EdgeIds = grant.EdgeIds.ToList()
                };
                var response = await handler.HandleAsync(
                    grant.RobotId,
                    new IssueNavigateCommandRequest(
                        grant.X,
                        grant.Y,
                        grant.Yaw,
                        grant.FrameId,
                        grant.JobId,
                        null,
                        grant.JobStepId,
                        route),
                    cancellationToken).ConfigureAwait(false);

                logger.LogInformation(
                    "Traffic grant → navigate robot {RobotId} jobStep {JobStepId} command {CommandId} edges={EdgeCount}",
                    grant.RobotId,
                    grant.JobStepId,
                    response.CommandId,
                    grant.EdgeIds.Count);
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Failed to issue navigate after traffic grant for robot {RobotId} jobStep {JobStepId}; releasing grant",
                    grant.RobotId,
                    grant.JobStepId);
                coordinator.ReleaseByJobStep(grant.JobStepId);
            }
        }
    }
}
