using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Enums;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

public sealed class RobotConnectivityMonitorHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<MqttOptions> mqttOptions,
    ILogger<RobotConnectivityMonitorHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Robot connectivity monitor tick failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        var timeout = TimeSpan.FromSeconds(Math.Max(1, mqttOptions.Value.HeartbeatTimeoutSeconds));
        var cutoff = DateTimeOffset.UtcNow - timeout;

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var notifier = scope.ServiceProvider.GetRequiredService<IRobotRealtimeNotifier>();
        var events = scope.ServiceProvider.GetRequiredService<IIntegrationEventPublisher>();

        var stale = await db.Robots
            .Where(r => r.IsOnline && (r.LastHeartbeatAt == null || r.LastHeartbeatAt < cutoff))
            .ToListAsync(cancellationToken);

        if (stale.Count == 0)
        {
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;
        foreach (var robot in stale)
        {
            if (!robot.MarkOffline(utcNow))
            {
                continue;
            }

            logger.LogInformation(
                "Robot {RobotCode} connectivity OFFLINE (heartbeat timeout)",
                robot.Code);

            var inFlight = await db.RobotCommands
                .Where(c => c.RobotId == robot.Id
                            && (c.Status == RobotCommandStatus.SENT
                                || c.Status == RobotCommandStatus.ACKED
                                || c.Status == RobotCommandStatus.RUNNING))
                .ToListAsync(cancellationToken);

            var abortedNavigate = false;
            foreach (var command in inFlight)
            {
                if (!command.TryAbortOffline(utcNow))
                {
                    continue;
                }

                if (command.Type == RobotCommandType.NAVIGATE_TO_POSE)
                {
                    abortedNavigate = true;
                }

                if (command.JobAssignmentId is { } assignmentId)
                {
                    var assignment = await db.JobAssignments.FirstOrDefaultAsync(
                        a => a.Id == assignmentId,
                        cancellationToken);
                    assignment?.TryEnd(AssignmentEndReason.ROBOT_OFFLINE, utcNow);
                }

                await events.PublishAsync(
                    new RobotCommandLifecycleChanged(
                        command.Id,
                        robot.Id,
                        robot.Code,
                        command.Type.ToString(),
                        command.Status.ToString(),
                        command.JobAssignmentId,
                        command.JobStepId,
                        null,
                        command.ErrorCode,
                        RobotCommandLifecycleChanged.Phases.OfflineAbort),
                    cancellationToken);
            }

            if (abortedNavigate)
            {
                robot.MarkAvailable(utcNow);
            }
            else
            {
                robot.ClearCurrentCommand(utcNow);
            }

            await notifier.NotifyConnectivityChangedAsync(
                robot.Id,
                robot.Code,
                robot.IsOnline,
                robot.Status,
                robot.LastHeartbeatAt,
                cancellationToken);

            await events.PublishAsync(
                new RobotConnectivityChanged(
                    robot.Id,
                    robot.Code,
                    robot.IsOnline,
                    robot.Status,
                    robot.LastHeartbeatAt),
                cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
