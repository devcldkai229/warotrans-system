using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.ProcessRobotHeartbeat;

public sealed class ProcessRobotHeartbeatHandler(
    FleetDbContext db,
    IRobotRealtimeNotifier realtimeNotifier,
    IIntegrationEventPublisher eventPublisher,
    ILogger<ProcessRobotHeartbeatHandler> logger)
{
    public async Task HandleAsync(RobotHeartbeatMessage message, CancellationToken cancellationToken)
    {
        var robot = await db.Robots
            .FirstOrDefaultAsync(r => r.Code == message.RobotCode, cancellationToken);

        if (robot is null)
        {
            logger.LogWarning(
                "Heartbeat for unknown robotCode {RobotCode} messageId {MessageId}",
                message.RobotCode,
                message.MessageId);
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;
        if (!robot.TryApplyHeartbeat(message.BootId, message.Sequence, message.SentAt, utcNow, out var becameOnline))
        {
            logger.LogDebug(
                "Ignored stale/duplicate heartbeat robotCode {RobotCode} messageId {MessageId} sequence {Sequence}",
                message.RobotCode,
                message.MessageId,
                message.Sequence);
            return;
        }

        // ExecuteUpdate: telemetry/job rewrite UpdatedAt concurrency token several times/sec;
        // tracked SaveChanges would drop HB liveness under Active NAVIGATE load.
        var bootId = robot.LastHeartbeatBootId;
        var sequence = robot.LastHeartbeatSequence;
        var isOnline = robot.IsOnline;
        await db.Robots
            .Where(r => r.Id == robot.Id)
            .ExecuteUpdateAsync(
                s => s
                    .SetProperty(r => r.LastHeartbeatAt, utcNow)
                    .SetProperty(r => r.LastHeartbeatBootId, bootId)
                    .SetProperty(r => r.LastHeartbeatSequence, sequence)
                    .SetProperty(r => r.IsOnline, isOnline)
                    .SetProperty(r => r.UpdatedAt, utcNow),
                cancellationToken);
        db.ChangeTracker.Clear();

        if (becameOnline)
        {
            logger.LogInformation(
                "Robot {RobotCode} connectivity ONLINE (messageId {MessageId})",
                robot.Code,
                message.MessageId);

            await realtimeNotifier.NotifyConnectivityChangedAsync(
                robot.Id,
                robot.Code,
                robot.IsOnline,
                robot.Status,
                robot.LastHeartbeatAt,
                cancellationToken);

            await eventPublisher.PublishAsync(
                new RobotConnectivityChanged(
                    robot.Id,
                    robot.Code,
                    robot.IsOnline,
                    robot.Status,
                    robot.LastHeartbeatAt),
                cancellationToken);
        }
        else
        {
            logger.LogDebug(
                "Heartbeat applied robotCode {RobotCode} messageId {MessageId}",
                robot.Code,
                message.MessageId);
        }
    }
}
