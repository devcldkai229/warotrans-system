using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.GetRobotStatistics;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

using WaroTrans.Fleet.Features.PoseHistory;

namespace WaroTrans.Fleet.Features.ProcessRobotTelemetry;

public sealed class ProcessRobotTelemetryHandler(
    FleetDbContext db,
    IRobotRealtimeNotifier realtimeNotifier,
    IIntegrationEventPublisher events,
    TrafficShadowObserver? trafficShadow,
    ILogger<ProcessRobotTelemetryHandler> logger,
    RobotPoseHistoryRecorder? poseHistory,
    Microsoft.Extensions.Options.IOptions<WaroTrans.Fleet.Features.Dispatch.BatteryOptions>? battery = null)
{
    private decimal LowBattery => battery?.Value.LowPercent is { } low ? (decimal)low : GetRobotStatisticsHandler.LowBatteryPercent;

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
        // A robot that never reported its battery has not "dropped" to low on its first reading: treat it as full.
        var batteryBefore = robot.BatteryMeasuredAt is null ? 100m : robot.BatteryPercent;
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

        if (applied)
        {
            robot.ApplyBatteryMetadata(message.BatteryVoltage, message.BatteryEstimationMode, message.BatteryConfidence);
        }

        if (!applied)
        {
            logger.LogDebug(
                "Ignored stale/duplicate telemetry robotCode {RobotCode} messageId {MessageId} sequence {Sequence}",
                message.RobotCode,
                message.MessageId,
                message.Sequence);
            return;
        }

        // RB-03: the robot is the truth about whether it holds motion. Older robots send no field: keep the value.
        var motionHeld = message.MotionHold ?? robot.MotionHeld;
        var holdChanged = motionHeld != robot.MotionHeld;
        var holdChangedAt = holdChanged ? utcNow : robot.MotionHoldChangedAt;

        // Same concurrency-safe path as heartbeat: avoid stale UpdatedAt dropping liveness.
        await db.Robots
            .Where(r => r.Id == robot.Id)
            .ExecuteUpdateAsync(
                s => s
                    .SetProperty(r => r.LastTelemetryAt, robot.LastTelemetryAt)
                    .SetProperty(r => r.LastTelemetryBootId, robot.LastTelemetryBootId)
                    .SetProperty(r => r.LastTelemetrySequence, robot.LastTelemetrySequence)
                    .SetProperty(r => r.PoseX, robot.PoseX)
                    .SetProperty(r => r.PoseY, robot.PoseY)
                    .SetProperty(r => r.PoseYaw, robot.PoseYaw)
                    .SetProperty(r => r.BatteryPercent, robot.BatteryPercent)
                    .SetProperty(r => r.BatteryMeasuredAt, robot.BatteryMeasuredAt)
                    .SetProperty(r => r.BatteryVoltage, robot.BatteryVoltage)
                    .SetProperty(r => r.BatteryEstimationMode, robot.BatteryEstimationMode)
                    .SetProperty(r => r.BatteryConfidence, robot.BatteryConfidence)
                    .SetProperty(r => r.NavigationStatus, robot.NavigationStatus)
                    .SetProperty(r => r.LocalizationStatus, robot.LocalizationStatus)
                    .SetProperty(r => r.LinearVelocity, robot.LinearVelocity)
                    .SetProperty(r => r.AngularVelocity, robot.AngularVelocity)
                    .SetProperty(r => r.MapVersionCode, robot.MapVersionCode)
                    .SetProperty(r => r.CurrentCommandId, robot.CurrentCommandId)
                    .SetProperty(r => r.ErrorCode, robot.ErrorCode)
                    .SetProperty(r => r.MotionHeld, motionHeld)
                    .SetProperty(r => r.MotionHoldChangedAt, holdChangedAt)
                    .SetProperty(r => r.UpdatedAt, robot.UpdatedAt),
                cancellationToken);
        db.ChangeTracker.Clear();
        if (poseHistory is not null)
        {
            await poseHistory.RecordAsync(robot, message.Pose is not null, utcNow, cancellationToken);
        }

        if (holdChanged)
        {
            await RobotStateJournal.WriteAsync(db, robot.Id, robot.Status, motionHeld ? "motion_held" : "motion_released", RobotStateEventSource.ROBOT, cancellationToken);
        }

        // Admin notifications: only the moment something starts, not every reading while it lasts.
        if (batteryBefore > LowBattery
            && message.BatteryPercent is not null
            && robot.BatteryPercent <= LowBattery
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
            robot.BatteryMeasuredAt is null ? null : robot.BatteryPercent,
            robot.NavigationStatus,
            robot.LocalizationStatus,
            robot.LastTelemetryAt,
            cancellationToken,
            robot.LinearVelocity,
            robot.AngularVelocity);

        if (trafficShadow is not null)
        {
            try
            {
                await trafficShadow.OnTelemetryAsync(
                    robot.Id,
                    robot.PoseX,
                    robot.PoseY,
                    localizationStatus == LocalizationStatus.LOCALIZED,
                    cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogDebug(ex, "Traffic shadow telemetry observe failed for {RobotCode}", robot.Code);
            }
        }
    }
}
