using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Fleet.Enums;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

public sealed class RobotCommandTimeoutMonitorHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<MqttOptions> mqttOptions,
    ILogger<RobotCommandTimeoutMonitorHostedService> logger) : BackgroundService
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
                logger.LogError(ex, "Robot command timeout monitor tick failed");
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
        var timeout = TimeSpan.FromSeconds(Math.Max(1, mqttOptions.Value.CommandAckTimeoutSeconds));
        var cutoff = DateTimeOffset.UtcNow - timeout;

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var events = scope.ServiceProvider.GetRequiredService<IIntegrationEventPublisher>();

        var stale = await db.RobotCommands
            .Where(c => c.Status == RobotCommandStatus.SENT && c.IssuedAt < cutoff)
            .ToListAsync(cancellationToken);

        if (stale.Count == 0)
        {
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;
        foreach (var command in stale)
        {
            if (!command.TryMarkAckTimeout(utcNow))
            {
                continue;
            }

            var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == command.RobotId, cancellationToken);
            if (command.Type == RobotCommandType.NAVIGATE_TO_POSE)
            {
                robot?.MarkAvailable(utcNow);
                if (command.JobAssignmentId is { } assignmentId)
                {
                    var assignment = await db.JobAssignments.FirstOrDefaultAsync(
                        a => a.Id == assignmentId,
                        cancellationToken);
                    assignment?.TryEnd(AssignmentEndReason.ACK_TIMEOUT, utcNow);
                }
            }

            logger.LogWarning(
                "Command {CommandId} ACK timeout for robot {RobotId}",
                command.Id,
                command.RobotId);

            await events.PublishAsync(
                new RobotCommandLifecycleChanged(
                    command.Id,
                    command.RobotId,
                    robot?.Code ?? string.Empty,
                    command.Type.ToString(),
                    command.Status.ToString(),
                    command.JobAssignmentId,
                    command.JobStepId,
                    null,
                    command.ErrorCode,
                    RobotCommandLifecycleChanged.Phases.AckTimeout),
                cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
