using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.GetRobotStatistics;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.ProcessRobotTelemetry;

public sealed class ProcessRobotTelemetryHandler(
    FleetDbContext db,
    IRobotRealtimeNotifier realtimeNotifier,
    IIntegrationEventPublisher events,
    ILogger<ProcessRobotTelemetryHandler> logger)
{
    public async Task HandleAsync(RobotTelemetryMessage message, CancellationToken cancellationToken)
    {
        var robot = await db.Robots
            .FirstOrDefaultAsync(r => r.Code == message.RobotCode, cancellationToken);

        if (robot is null)
        {
            logger.LogWarning(
                "Telemetry for unknown robotCode {RobotCode} messageId {MessageId}",
                message.RobotCode,
                message.MessageId);
            return;
        }

        if (!Enum.TryParse<NavigationStatus>(message.NavigationStatus, ignoreCase: false, out var navigationStatus)
            || !Enum.TryParse<LocalizationStatus>(message.LocalizationStatus, ignoreCase: false, out var localizationStatus))
        {
            logger.LogWarning(
                "Telemetry status parse failed robotCode {RobotCode} messageId {MessageId}",
                message.RobotCode,
                message.MessageId);
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;
        var batteryBefore = robot.BatteryPercent;
        var errorBefore = robot.ErrorCode;
        var applied = robot.TryApplyTelemetry(
            message.BootId,
            message.Sequence,
            message.SentAt,
            utcNow,
            message.Pose?.X,
            message.Pose?.Y,
            message.Pose?.Yaw,
            message.BatteryPercent,
            navigationStatus,
            localizationStatus,
            message.LinearVelocity,
            message.AngularVelocity,
            message.MapVersionCode,
            message.CurrentCommandId,
            message.ErrorCode);

        if (!applied)
        {
            logger.LogDebug(
                "Ignored stale/duplicate telemetry robotCode {RobotCode} messageId {MessageId} sequence {Sequence}",
                message.RobotCode,
                message.MessageId,
                message.Sequence);
            return;
        }

        await db.SaveChangesAsync(cancellationToken);

        // Admin notifications: only the moment something starts, not every reading while it lasts.
        if (batteryBefore > GetRobotStatisticsHandler.LowBatteryPercent
            && robot.BatteryPercent <= GetRobotStatisticsHandler.LowBatteryPercent
            && robot.Status != RobotStatus.CHARGING)
        {
            await events.PublishAsync(new RobotBatteryLow(robot.Id, robot.Code, robot.BatteryPercent), cancellationToken);
        }

        if (string.IsNullOrEmpty(errorBefore) && !string.IsNullOrEmpty(robot.ErrorCode))
        {
            await events.PublishAsync(new RobotErrorReported(robot.Id, robot.Code, robot.ErrorCode), cancellationToken);
        }

        logger.LogDebug(
            "Telemetry applied robotCode {RobotCode} messageId {MessageId}",
            robot.Code,
            message.MessageId);

        await realtimeNotifier.NotifyTelemetryUpdatedAsync(
            robot.Id,
            robot.Code,
            robot.PoseX,
            robot.PoseY,
            robot.PoseYaw,
            robot.BatteryPercent,
            robot.NavigationStatus,
            robot.LocalizationStatus,
            robot.LastTelemetryAt,
            cancellationToken,
            robot.LinearVelocity,
            robot.AngularVelocity);
    }
}
