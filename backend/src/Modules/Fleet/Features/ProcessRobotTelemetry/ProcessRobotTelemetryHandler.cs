using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Battery;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Features.ProcessRobotTelemetry;

public sealed class ProcessRobotTelemetryHandler(
    FleetDbContext db,
    IRobotRealtimeNotifier realtimeNotifier,
    IIntegrationEventPublisher events,
    TrafficShadowObserver? trafficShadow,
    IOptions<BatteryOptions> batteryOptions,
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
            ToBatteryReading(message),
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
        var batteryAfter = robot.BatteryPercent;
        switch (BatteryAlertRules.Evaluate(batteryBefore, batteryAfter, batteryOptions.Value))
        {
            case BatteryAlertTransition.CRITICAL when robot.Status != RobotStatus.CHARGING:
                await events.PublishAsync(new RobotBatteryCritical(robot.Id, robot.Code, batteryAfter!.Value), cancellationToken);
                break;
            case BatteryAlertTransition.LOW when robot.Status != RobotStatus.CHARGING:
                await events.PublishAsync(new RobotBatteryLow(robot.Id, robot.Code, batteryAfter!.Value), cancellationToken);
                break;
            case BatteryAlertTransition.RECOVERED:
                await events.PublishAsync(new RobotBatteryRecovered(robot.Id, robot.Code, batteryAfter!.Value), cancellationToken);
                break;
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
            robot.AngularVelocity,
            RobotBatteryResponse.From(robot, batteryOptions.Value, utcNow));

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

    /// <summary>Unknown modes/confidences are rejected by the validator; anything unparsable here is dropped.</summary>
    public static RobotBatteryReading ToBatteryReading(RobotTelemetryMessage message) => new(
        message.BatteryPercent,
        message.BatteryVoltage,
        ParseOrNull<BatteryEstimationMode>(message.BatteryEstimationMode),
        ParseOrNull<BatteryConfidence>(message.BatteryConfidence),
        ParseOrNull<BatteryChargingState>(message.BatteryChargingState));

    private static T? ParseOrNull<T>(string? value) where T : struct, Enum =>
        Enum.TryParse<T>(value, ignoreCase: false, out var parsed) ? parsed : null;
}
