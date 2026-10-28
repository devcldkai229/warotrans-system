using System.Collections.Immutable;
using System.Threading.Channels;

namespace WaroTrans.Fleet.Traffic;

public enum TrafficEventKind
{
    AuthorityGranted,
    AuthorityExtended,
    AuthorityRenewed,
    AuthorityRevoked,
    Quarantined,
    /// <summary>Route finished (NAVIGATE SUCCEEDED): authority cleared, no more renew/extend.</summary>
    AuthorityReleased
}

public sealed record TrafficEvent(
    TrafficEventKind Kind,
    Guid RobotId,
    string RobotCode,
    MotionAuthority Authority,
    Guid? CommandId,
    Guid? JobId,
    Guid? JobStepId,
    double? GoalX,
    double? GoalY,
    double? GoalYaw,
    DateTimeOffset? ExpiresAt,
    bool IsFirstSegment,
    // Authority now covers the route's last edge: Goal* is the destination endpoint pose (robot finishes NAVIGATE).
    bool IsFinalSegment = false);

/// <summary>Bounded outbox for Active Mode MQTT publishers (no IO in the actor).</summary>
public sealed class TrafficEventOutbox
{
    private readonly Channel<TrafficEvent> _channel;

    public TrafficEventOutbox(int capacity = 512)
    {
        _channel = Channel.CreateBounded<TrafficEvent>(new BoundedChannelOptions(Math.Max(16, capacity))
        {
            SingleReader = false,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropOldest
        });
    }

    public void Publish(TrafficEvent evt) => _channel.Writer.TryWrite(evt);

    public IAsyncEnumerable<TrafficEvent> ReadAllAsync(CancellationToken ct) =>
        _channel.Reader.ReadAllAsync(ct);
}
