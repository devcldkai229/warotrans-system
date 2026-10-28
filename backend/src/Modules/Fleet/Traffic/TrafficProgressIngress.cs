using System.Collections.Immutable;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Traffic;

/// <summary>Maps robot traffic_progress / authority_state MQTT uplinks into the segmented coordinator.</summary>
public sealed class TrafficProgressIngress(
    ISegmentedTrafficCoordinator coordinator,
    FleetDbContext db,
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
                await coordinator.ReportProgressAsync(
                    robot.Id, message.Seq, message.Epoch, null,
                    message.PoseX, message.PoseY, message.LocalizationOk, ct)
                    .ConfigureAwait(false);
                // Next safe-stop segment of the route (EXTEND); if busy it is retried by the renew tick.
                var advance = await coordinator.AdvanceRouteAsync(robot.Id, ct).ConfigureAwait(false);
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

        var edges = message.GrantedEdgeIds?.ToImmutableArray() ?? [];
        await coordinator.ReconcileRobotAsync(
            robot.Id,
            robot.PoseX,
            robot.PoseY,
            localizationOk: string.Equals(message.State, "FAULTED", StringComparison.OrdinalIgnoreCase) == false,
            edges,
            ct).ConfigureAwait(false);
    }
}
