using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Host.Hubs;

namespace WaroTrans.Host.Realtime;

/// <summary>
/// RTM-02: pushes "trafficUpdated" to whoever may see the robot. Decisions an operator must see (grant, block,
/// quarantine, release, cancel, recovery, timeout) go out at once; the chatty ones (request, wait, enter, service,
/// exit) at most once per robot per <see cref="ChattyInterval"/>. Clients refetch GET /api/fleet/traffic/snapshot,
/// so a throttled or dropped event only delays the screen.
/// </summary>
public sealed class SignalRTrafficRealtimeNotifier(
    IHubContext<NotificationsHub> hub,
    ILogger<SignalRTrafficRealtimeNotifier> logger) : ITrafficRealtimeNotifier
{
    private static readonly TimeSpan ChattyInterval = TimeSpan.FromSeconds(1);

    private static readonly HashSet<TrafficOpsEventType> Important =
    [
        TrafficOpsEventType.Grant,
        TrafficOpsEventType.Block,
        TrafficOpsEventType.Quarantine,
        TrafficOpsEventType.Release,
        TrafficOpsEventType.Cancel,
        TrafficOpsEventType.Recovery,
        TrafficOpsEventType.Timeout
    ];

    private readonly ConcurrentDictionary<Guid, DateTimeOffset> _lastChatty = new();

    public void Publish(TrafficOpsEvent evt)
    {
        if (!Important.Contains(evt.EventType) && evt.RobotId is { } robot)
        {
            var now = DateTimeOffset.UtcNow;
            var last = _lastChatty.GetOrAdd(robot, DateTimeOffset.MinValue);
            if (now - last < ChattyInterval || !_lastChatty.TryUpdate(robot, now, last))
            {
                return;
            }
        }

        var groups = evt.RobotId is { } id ? RealtimeGroups.ForRobot(id) : [RealtimeGroups.AllRobots];
        var payload = new
        {
            eventType = evt.EventType.ToString(),
            evt.RobotId,
            evt.JobId,
            evt.JobStepId,
            evt.ResourceId,
            evt.SegmentEdgeIds,
            reason = evt.Detail,
            occurredAt = evt.Timestamp
        };

        _ = SendAsync(groups, payload);
    }

    private async Task SendAsync(IReadOnlyList<string> groups, object payload)
    {
        try
        {
            await hub.Clients.Groups(groups).SendAsync("trafficUpdated", payload);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "trafficUpdated push failed");
        }
    }
}
