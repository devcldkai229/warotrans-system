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

/// <summary>
/// Outbox for Active Mode MQTT publishers (no IO in the actor). Grant / extend / revoke / release events are never
/// dropped (audit T14: a lost grant leaves resources held with no NAVIGATE, a lost extend parks the robot forever);
/// only periodic RENEW events — superseded by the next one 1.5 s later — go through a bounded drop-oldest lane.
/// Critical events are always delivered first.
/// </summary>
public sealed class TrafficEventOutbox
{
    private readonly Channel<TrafficEvent> _critical;
    private readonly Channel<TrafficEvent> _renew;

    public TrafficEventOutbox(int capacity = 512)
    {
        _critical = Channel.CreateUnbounded<TrafficEvent>(new UnboundedChannelOptions
        {
            SingleReader = false,
            SingleWriter = false
        });
        _renew = Channel.CreateBounded<TrafficEvent>(new BoundedChannelOptions(Math.Max(16, capacity))
        {
            SingleReader = false,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropOldest
        });
    }

    public void Publish(TrafficEvent evt)
    {
        var lane = evt.Kind == TrafficEventKind.AuthorityRenewed ? _renew : _critical;
        lane.Writer.TryWrite(evt);
    }

    public async IAsyncEnumerable<TrafficEvent> ReadAllAsync(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            if (_critical.Reader.TryRead(out var critical))
            {
                yield return critical;
                continue;
            }

            if (_renew.Reader.TryRead(out var renew))
            {
                yield return renew;
                continue;
            }

            await Task.WhenAny(
                _critical.Reader.WaitToReadAsync(ct).AsTask(),
                _renew.Reader.WaitToReadAsync(ct).AsTask()).ConfigureAwait(false);
        }
    }
}
