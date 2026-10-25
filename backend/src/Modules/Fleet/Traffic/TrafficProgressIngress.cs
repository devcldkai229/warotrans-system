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
                if (message.LocalizationOk)
                {
                    var snap = await coordinator.GetTrafficSnapshotAsync(ct).ConfigureAwait(false);
                    var view = snap.Robots.FirstOrDefault(r => r.RobotId == robot.Id);
                    var resources = view?.OccupiedResourceIds ?? [];
                    if (resources.Length > 0 && message.PoseX is double x && message.PoseY is double y)
                    {
                        await coordinator.ReportVerifiedExitAsync(
                            robot.Id, message.Seq, message.Epoch, resources, x, y, true, ct)
                            .ConfigureAwait(false);
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
