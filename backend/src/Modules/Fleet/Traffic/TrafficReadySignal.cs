namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Event-driven wakeup for V1 grant → navigate pump (replaces 200 ms polling).
/// </summary>
public sealed class TrafficReadySignal
{
    private readonly object _gate = new();
    private TaskCompletionSource _tcs = NewTcs();

    public void Notify()
    {
        TaskCompletionSource toRelease;
        lock (_gate)
        {
            toRelease = _tcs;
            _tcs = NewTcs();
        }

        toRelease.TrySetResult();
    }

    public Task WaitAsync(CancellationToken cancellationToken)
    {
        Task wait;
        lock (_gate)
        {
            wait = _tcs.Task;
        }

        return wait.WaitAsync(cancellationToken);
    }

    private static TaskCompletionSource NewTcs() =>
        new(TaskCreationOptions.RunContinuationsAsynchronously);
}
