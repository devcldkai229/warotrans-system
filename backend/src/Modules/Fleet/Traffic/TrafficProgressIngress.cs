using System.Collections.Immutable;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.IssueCancelCommand;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Traffic;

/// <summary>Maps robot traffic_progress / authority_state MQTT uplinks into the segmented coordinator.</summary>
public sealed class TrafficProgressIngress(
    ISegmentedTrafficCoordinator coordinator,
    FleetDbContext db,
    IOptions<TrafficOptions> options,
    IMqttTrafficEpochPublisher trafficDownlink,
    IssueCancelCommandHandler cancelCommands,
    ILogger<TrafficProgressIngress> logger)
{
    public async Task HandlePlanProposeAsync(TrafficPlanProposeMessage message, CancellationToken ct)
    {
        if (options.Value.Mode != TrafficCoordinatorMode.Semantic)
        {
            logger.LogDebug("Ignore traffic_plan propose outside Semantic mode ({Mode})", options.Value.Mode);
            return;
        }

        var robot = await db.Robots.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Code == message.RobotCode, ct)
            .ConfigureAwait(false);
        if (robot is null)
        {
            logger.LogWarning("traffic_plan for unknown robot {RobotCode}", message.RobotCode);
            return;
        }

        // A grant is tied to the backend NAVIGATE the plan executes: it must be this robot's open one.
        if (message.CommandId is Guid commandId)
        {
            var open = await db.RobotCommands.AsNoTracking()
                .AnyAsync(c => c.Id == commandId
                               && c.RobotId == robot.Id
                               && c.Type == RobotCommandType.NAVIGATE_TO_POSE
                               && (c.Status == RobotCommandStatus.SENT
                                   || c.Status == RobotCommandStatus.ACKED
                                   || c.Status == RobotCommandStatus.RUNNING), ct)
                .ConfigureAwait(false);
            if (!open)
            {
                logger.LogWarning(
                    "traffic_plan robot={RobotCode} rev={Rev} for command {CommandId} that is not its open NAVIGATE; ignored",
                    message.RobotCode, message.PlanRevision, commandId);
                return;
            }
        }

        var poses = message.Poses
            .Select(p => new SemanticPlanPose(p.X, p.Y, p.Yaw))
            .ToImmutableArray();
        SemanticPlanPose? goal = message.Goal is { } g
            ? new SemanticPlanPose(g.X, g.Y, g.Yaw)
            : null;
        var req = new SemanticPlanProposeRequest(
            message.MessageId == Guid.Empty ? Guid.NewGuid() : message.MessageId,
            robot.Id,
            message.RobotCode,
            message.SemanticMapFingerprint,
            message.PlanRevision,
            poses,
            goal,
            message.JobStepId,
            message.JobId,
            PlanHash: message.PlanHash,
            CommandId: message.CommandId);
        var result = await coordinator.AcquireSemanticPlanAsync(req, ct).ConfigureAwait(false);
        logger.LogInformation(
            "traffic_plan robot={RobotCode} rev={Rev} granted={Granted} queued={Queued} reason={Reason} wait={Wait} blocker={Blocker}",
            message.RobotCode,
            message.PlanRevision,
            result.Granted,
            result.Queued,
            result.Reason,
            result.WaitingReason,
            result.BlockingOwner);
        if (!result.Granted)
        {
            await trafficDownlink.PublishPlanRejectAsync(
                message.RobotCode,
                message.PlanRevision,
                result.Reason,
                result.WaitingReason.ToString(),
                result.BlockingOwner?.ToString(),
                ct).ConfigureAwait(false);
        }
    }

    public async Task HandleProgressAsync(TrafficProgressMessage message, CancellationToken ct)
    {
        var robot = await db.Robots.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Code == message.RobotCode, ct)
            .ConfigureAwait(false);
        if (robot is null)
        {
            logger.LogWarning("traffic_progress for unknown robot {RobotCode}", message.RobotCode);
            return;
        }

        switch (message.Event)
        {
            case TrafficProgressEvents.Started:
            case TrafficProgressEvents.EdgeEntered:
            case TrafficProgressEvents.EdgeExited:
                await coordinator.ReportProgressAsync(
                    robot.Id,
                    message.Seq,
                    message.Epoch,
                    null,
                    message.PoseX,
                    message.PoseY,
                    message.LocalizationOk,
                    ct).ConfigureAwait(false);
                break;

            case TrafficProgressEvents.SafeStopReached:
                if (message.PoseX is double x && message.PoseY is double y)
                {
                    // Releases only what the robot has physically left; the lane it stands on stays held.
                    var exit = await coordinator.ReportSafeStopReachedAsync(
                        robot.Id, message.Seq, message.Epoch, x, y, message.LocalizationOk, ct)
                        .ConfigureAwait(false);
                    if (!exit.Ok)
                    {
                        logger.LogWarning(
                            "SAFE_STOP_REACHED robot={RobotCode} seq={Seq} not applied: {Reason}",
                            message.RobotCode, message.Seq, exit.Reason);
                    }
                }

                break;

            case TrafficProgressEvents.Fault:
            case TrafficProgressEvents.StoppedAwaitingAuthority when message.FaultCode is not null:
                await coordinator.MarkBlockedAsync(
                    robot.Id,
                    message.FaultCode ?? message.Event,
                    ct).ConfigureAwait(false);
                break;

            case TrafficProgressEvents.StoppedAwaitingAuthority:
                // Next safe-stop segment of the route (EXTEND) — only for an accepted report at the goal safe stop;
                // a busy segment is retried by the renew tick.
                var advance = await coordinator.ReportStoppedAwaitingAsync(
                    robot.Id, message.Seq, message.Epoch, message.PoseX, message.PoseY, message.LocalizationOk, ct)
                    .ConfigureAwait(false);
                if (!advance.Ok)
                {
                    logger.LogInformation(
                        "Robot {RobotCode} awaiting authority, no EXTEND yet: {Reason}",
                        message.RobotCode, advance.Reason);
                }

                break;
        }

        // Stage-3: robot reports physical clearance of reserved resources.
        if (message.ClearedResourceIds is { Count: > 0 } cleared
            && message.PoseX is double cx && message.PoseY is double cy)
        {
            await coordinator.ReportVerifiedExitAsync(
                robot.Id,
                message.Seq,
                message.Epoch,
                cleared.ToImmutableArray(),
                cx,
                cy,
                message.LocalizationOk,
                ct).ConfigureAwait(false);
        }
    }

    public async Task HandleAuthorityStateAsync(AuthorityStateMessage message, CancellationToken ct)
    {
        var robot = await db.Robots.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Code == message.RobotCode, ct)
            .ConfigureAwait(false);
        if (robot is null)
        {
            return;
        }

        // Boot / reconnect / post-fault sync (audit T2). Occupancy is rebuilt only from a fresh, localized pose;
        // otherwise the robot is quarantined and keeps everything it held.
        // The robot's own pose in the message is the freshest evidence (sent at reconnect, before new telemetry has
        // reached the database); otherwise the stored telemetry, only while fresh.
        var maxAge = TimeSpan.FromSeconds(Math.Max(0.5, options.Value.PoseMaxAgeSec));
        var reported = message is { LocalizationOk: true, PoseX: double, PoseY: double };
        var poseFresh = reported || (robot.LastTelemetryAt is { } at && DateTimeOffset.UtcNow - at <= maxAge);
        // A robot that says it is not localized is believed over any telemetry stored before it said so.
        var localized = reported
                        || (message.LocalizationOk != false
                            && poseFresh && robot.LocalizationStatus == LocalizationStatus.LOCALIZED);
        var poseX = reported ? message.PoseX!.Value : robot.PoseX;
        var poseY = reported ? message.PoseY!.Value : robot.PoseY;
        var faulted = string.Equals(message.State, "FAULTED", StringComparison.OrdinalIgnoreCase);
        var idle = faulted || string.Equals(message.State, "IDLE", StringComparison.OrdinalIgnoreCase);
        var edges = message.GrantedEdgeIds?.ToImmutableArray() ?? [];
        var result = await coordinator.ReconcileRobotAsync(
            robot.Id,
            poseX,
            poseY,
            localized,
            edges,
            robotReportsIdle: idle,
            ct).ConfigureAwait(false);
        if (faulted)
        {
            // The robot stopped on its own fault: occupancy is now known from its pose, but the fault itself
            // still needs an operator / new verified state before motion is granted again.
            await coordinator.MarkBlockedAsync(robot.Id, "ROBOT_FAULTED", ct).ConfigureAwait(false);
        }

        logger.LogInformation(
            "authority_state robot={RobotCode} state={State} poseFresh={Fresh} reconcile={Ok}:{Reason}",
            message.RobotCode, message.State, poseFresh, result.Ok, result.Reason);

        if (message.ActiveCommandId is Guid active
            && await cancelCommands.CancelOrphanAsync(robot.Id, active, ct).ConfigureAwait(false))
        {
            logger.LogWarning(
                "Robot {RobotCode} still executes closed command {CommandId}: CANCEL sent", message.RobotCode, active);
        }
    }
}
