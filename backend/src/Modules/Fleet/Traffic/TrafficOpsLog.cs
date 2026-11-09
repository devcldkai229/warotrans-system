using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace WaroTrans.Fleet.Traffic;

public enum TrafficOpsEventType
{
    Request,
    Grant,
    Wait,
    Enter,
    Service,
    Exit,
    Release,
    Block,
    Timeout,
    Recovery,
    Cancel,
    Quarantine
}

public sealed record TrafficOpsEvent(
    Guid EventId,
    TrafficOpsEventType EventType,
    DateTimeOffset Timestamp,
    Guid? RobotId,
    Guid? JobId,
    Guid? JobStepId,
    Guid? MapVersionId,
    Guid? AuthorityId,
    string? ResourceId,
    IReadOnlyList<int>? SegmentEdgeIds,
    Guid? CommandId,
    long? BackendEpoch,
    long? Seq,
    string? Detail);

public interface ITrafficOpsLog
{
    void Write(TrafficOpsEvent evt);
    IReadOnlyList<TrafficOpsEvent> Recent(int take = 100);
}

/// <summary>
/// RTM-02: hears every traffic ops event (grant, wait, block, quarantine …) so live pages can show why a robot holds.
/// Must not block or throw: it is called on the traffic path.
/// </summary>
public interface ITrafficRealtimeNotifier
{
    void Publish(TrafficOpsEvent evt);
}

/// <summary>Structured correlation log for traffic ops. In-memory ring + ILogger; no AI in path.</summary>
public sealed class TrafficOpsLog(ILogger<TrafficOpsLog> logger, ITrafficRealtimeNotifier? realtime = null) : ITrafficOpsLog
{
    private const int Capacity = 2048;
    private readonly ConcurrentQueue<TrafficOpsEvent> _ring = new();
    private int _count;

    public void Write(TrafficOpsEvent evt)
    {
        _ring.Enqueue(evt);
        if (Interlocked.Increment(ref _count) > Capacity)
        {
            if (_ring.TryDequeue(out _))
            {
                Interlocked.Decrement(ref _count);
            }
        }

        logger.LogInformation(
            "TrafficOps {EventType} robot={RobotId} job={JobId} step={JobStepId} map={MapVersionId} auth={AuthorityId} resource={ResourceId} cmd={CommandId} epoch={Epoch} seq={Seq} detail={Detail}",
            evt.EventType,
            evt.RobotId,
            evt.JobId,
            evt.JobStepId,
            evt.MapVersionId,
            evt.AuthorityId,
            evt.ResourceId,
            evt.CommandId,
            evt.BackendEpoch,
            evt.Seq,
            evt.Detail);

        try
        {
            realtime?.Publish(evt);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Traffic realtime push failed for {EventType}", evt.EventType);
        }
    }

    public IReadOnlyList<TrafficOpsEvent> Recent(int take = 100) =>
        _ring.Reverse().Take(Math.Clamp(take, 1, Capacity)).Reverse().ToList();
}
