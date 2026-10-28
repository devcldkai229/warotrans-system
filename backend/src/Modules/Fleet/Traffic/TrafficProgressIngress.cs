using System.Collections.Immutable;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Traffic;

/// <summary>Maps robot traffic_progress / authority_state MQTT uplinks into the segmented coordinator.</summary>
public sealed class TrafficProgressIngress(
    ISegmentedTrafficCoordinator coordinator,
    FleetDbContext db,
    IOptions<TrafficOptions> options,
    ILogger<TrafficProgressIngress> logger)
{
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
        var maxAge = TimeSpan.FromSeconds(Math.Max(0.5, options.Value.PoseMaxAgeSec));
        var poseFresh = robot.LastTelemetryAt is { } at && DateTimeOffset.UtcNow - at <= maxAge;
        var localized = poseFresh && robot.LocalizationStatus == LocalizationStatus.LOCALIZED;
        var faulted = string.Equals(message.State, "FAULTED", StringComparison.OrdinalIgnoreCase);
        var idle = faulted || string.Equals(message.State, "IDLE", StringComparison.OrdinalIgnoreCase);
        var edges = message.GrantedEdgeIds?.ToImmutableArray() ?? [];
        var result = await coordinator.ReconcileRobotAsync(
            robot.Id,
            robot.PoseX,
            robot.PoseY,
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
    }
}
