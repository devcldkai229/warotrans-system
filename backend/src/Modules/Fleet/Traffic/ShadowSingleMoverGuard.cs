namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// In Shadow Mode, at most one robot may be actively moving per map.
/// Reservations must not drive multi-robot operation while Shadow is observing.
/// </summary>
public sealed class ShadowSingleMoverGuard
{
    private readonly object _gate = new();
    private readonly Dictionary<Guid, Guid> _moverByMap = new();

    public bool TryEnter(Guid mapVersionId, Guid robotId, out Guid? blockingRobotId)
    {
        lock (_gate)
        {
            if (_moverByMap.TryGetValue(mapVersionId, out var existing) && existing != robotId)
            {
                blockingRobotId = existing;
                return false;
            }

            _moverByMap[mapVersionId] = robotId;
            blockingRobotId = null;
            return true;
        }
    }

    public void Exit(Guid mapVersionId, Guid robotId)
    {
        lock (_gate)
        {
            if (_moverByMap.TryGetValue(mapVersionId, out var existing) && existing == robotId)
            {
                _moverByMap.Remove(mapVersionId);
            }
        }
    }

    public Guid? CurrentMover(Guid mapVersionId)
    {
        lock (_gate)
        {
            return _moverByMap.TryGetValue(mapVersionId, out var id) ? id : null;
        }
    }
}
