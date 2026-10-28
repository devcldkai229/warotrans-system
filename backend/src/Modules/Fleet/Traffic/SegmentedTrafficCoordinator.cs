using System.Collections.Immutable;
using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Single-writer Channel actor wrapping <see cref="TrafficState"/>. No IO inside the actor loop.
/// </summary>
public sealed class SegmentedTrafficCoordinator : ISegmentedTrafficCoordinator, IHostedService, IAsyncDisposable
{
    private readonly Channel<WorkItem> _inbox;
    private readonly TrafficState _state;
    private readonly RoutePlanner _planner;
    private readonly TrafficOptions _options;
    private readonly TrafficEventOutbox _outbox;
    private readonly ILogger<SegmentedTrafficCoordinator> _logger;
    private readonly TimeProvider _clock;
    private Task? _loop;
    private CancellationTokenSource? _cts;
    private int _started;

    public SegmentedTrafficCoordinator(
        IOptions<TrafficOptions> options,
        TrafficEventOutbox outbox,
        ILogger<SegmentedTrafficCoordinator> logger,
        TimeProvider? clock = null)
    {
        _options = options.Value;
        _outbox = outbox;
        _logger = logger;
        _clock = clock ?? TimeProvider.System;
        _state = new TrafficState(_options, _clock);
        _planner = new RoutePlanner(_options);
        var cap = Math.Max(16, _options.InboxCapacity);
        _inbox = Channel.CreateBounded<WorkItem>(new BoundedChannelOptions(cap)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait
        });
        // Epoch must grow across host restarts: robots persist (lastEpoch, lastSeq) and reject a fresh
        // epoch-1 grant as STALE_SEQ. Start-up wall-clock seconds is monotonic enough for that.
        _state.BeginEpoch(Math.Max(1, _clock.GetUtcNow().ToUnixTimeSeconds()));
    }

    /// <summary>Test helper: drive state synchronously without the channel loop.</summary>
    public TrafficState UnsafeStateForTests => _state;

    public long Epoch => _state.Epoch;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (Interlocked.Exchange(ref _started, 1) == 1)
        {
            return Task.CompletedTask;
        }

        // Own CTS — do NOT link to StartAsync's token. Host disposes that source on shutdown,
        // which disposes a linked CTS and makes CancelAsync throw ObjectDisposedException in Stop/Dispose.
        _ = cancellationToken;
        _cts = new CancellationTokenSource();
        _loop = Task.Run(() => RunAsync(_cts.Token), CancellationToken.None);
        _logger.LogInformation("Segmented traffic coordinator started in {Mode} mode epoch={Epoch}", _options.Mode, Epoch);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        var cts = Interlocked.Exchange(ref _cts, null);
        if (cts is null)
        {
            return;
        }

        _inbox.Writer.TryComplete();
        try
        {
            await cts.CancelAsync().ConfigureAwait(false);
            if (_loop is not null)
            {
                await Task.WhenAny(_loop, Task.Delay(TimeSpan.FromSeconds(5), cancellationToken)).ConfigureAwait(false);
            }
        }
        catch (ObjectDisposedException ex)
        {
            _logger.LogDebug(ex, "Traffic coordinator CTS already disposed during stop");
        }
        catch (OperationCanceledException)
        {
            // ignore
        }
        finally
        {
            cts.Dispose();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync(CancellationToken.None).ConfigureAwait(false);
    }

    public Task BindGraphAsync(Guid mapVersionId, CompiledTrafficGraph graph, CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            s.BindGraph(mapVersionId, graph);
            return TrafficOpResult.Success();
        }, ct);

    public Task CompleteReconciliationAsync(IReadOnlyList<TrafficReconcileSeed> seeds, CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            s.CompleteReconciliation(seeds);
            return TrafficOpResult.Success();
        }, ct);

    public async Task<RoutePlanResult> RequestRouteAsync(RoutePlanRequest request, CancellationToken ct = default)
    {
        // Path search OFF the actor. Snapshot congestion via a quick actor read.
        var snap = await GetTrafficSnapshotAsync(ct).ConfigureAwait(false);
        var congestion = snap.Resources.ToDictionary(r => r.ResourceId, r => r.Holders.Length, StringComparer.Ordinal);
        return _planner.Plan(request, congestion, snap.StateVersion);
    }

    public async Task<RoutePlanResult> RequestSegmentAsync(RoutePlanRequest request, CancellationToken ct = default)
    {
        var plan = await RequestRouteAsync(request, ct).ConfigureAwait(false);
        if (!plan.Ok || plan.Segments.Length == 0)
        {
            return plan;
        }

        // Return only the next segment as the actionable unit.
        return RoutePlanResult.OkPlan(plan.FullEdgeIds, [plan.Segments[0]], plan.Alternatives);
    }

    public Task<AcquireResult> AcquireRouteAsync(
        ImmutableArray<RouteSegmentCandidate> segments,
        TrafficRouteGoal goal,
        long? epoch = null,
        CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.AcquireRoute(segments, goal, epoch);
            PublishGranted(s);
            return result;
        }, ct);

    public Task<TrafficOpResult> AdvanceRouteAsync(Guid robotId, CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.AdvanceRoute(robotId);
            PublishGranted(s);
            return result;
        }, ct);

    public Task<TrafficOpResult> ReportSafeStopReachedAsync(
        Guid robotId, long seq, long epoch, double poseX, double poseY, bool localizationOk, CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.ReportSafeStopReached(robotId, seq, epoch, poseX, poseY, localizationOk);
            PublishGranted(s);
            return result;
        }, ct);

    public Task<TrafficOpResult> CompleteRouteAsync(Guid robotId, bool succeeded, string? reason, CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.CompleteRoute(robotId, succeeded, reason);
            PublishGranted(s);
            return result;
        }, ct);

    public Task<AcquireResult> AcquireAtomicAsync(
        RouteSegmentCandidate candidate,
        long? epoch = null,
        long? seq = null,
        CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.AcquireAtomic(candidate, epoch, seq);
            PublishGranted(s);
            return result;
        }, ct);

    public Task<AcquireResult> ExtendAtomicAsync(
        RouteSegmentCandidate candidate,
        long? epoch = null,
        CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.ExtendAtomic(candidate, epoch);
            PublishGranted(s);
            return result;
        }, ct);

    private void PublishGranted(TrafficState state)
    {
        foreach (var evt in state.DrainEvents())
        {
            _outbox.Publish(evt);
        }
    }

    public Task<TrafficOpResult> RenewAuthorityAsync(
        Guid robotId, Guid authorityId, long epoch, CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var ttl = TimeSpan.FromSeconds(Math.Max(5, _options.AuthorityTtlSec));
            var result = s.RenewAuthority(robotId, authorityId, epoch, ttl);
            PublishGranted(s);
            return result;
        }, ct);

    public async Task<int> RenewAllActiveAuthoritiesAsync(CancellationToken ct = default)
    {
        if (_options.Mode != TrafficCoordinatorMode.Active)
        {
            return 0;
        }

        // Retry EXTEND for robots parked at a safe stop whose next segment was busy.
        var awaiting = await EnqueueAsync(s => s.RobotsAwaitingExtension(), ct).ConfigureAwait(false);
        foreach (var robotId in awaiting)
        {
            await AdvanceRouteAsync(robotId, ct).ConfigureAwait(false);
        }

        var keys = await EnqueueAsync(s => s.ActiveAuthorityKeys(), ct).ConfigureAwait(false);
        var n = 0;
        foreach (var (robotId, authorityId) in keys)
        {
            var result = await RenewAuthorityAsync(robotId, authorityId, Epoch, ct).ConfigureAwait(false);
            if (result.Ok)
            {
                n++;
            }
        }

        return n;
    }

    public Task<TrafficOpResult> ReportProgressAsync(
        Guid robotId, long seq, long epoch, int? nodeId, double? x, double? y, bool localizationOk,
        CancellationToken ct = default) =>
        EnqueueAsync(s => s.ReportProgress(robotId, seq, epoch, nodeId, x, y, localizationOk), ct);

    public Task<TrafficOpResult> ReportVerifiedExitAsync(
        Guid robotId, long seq, long epoch, ImmutableArray<string> resourceIds, double poseX, double poseY, bool localizationOk,
        CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.ReportVerifiedExit(robotId, seq, epoch, resourceIds, poseX, poseY, localizationOk);
            PublishGranted(s); // promoted waiters
            return result;
        }, ct);

    public Task<TrafficOpResult> HoldServiceResourceAsync(Guid robotId, string resourceId, CancellationToken ct = default) =>
        EnqueueAsync(s => s.HoldServiceResource(robotId, resourceId), ct);

    public Task<TrafficOpResult> ReleaseAfterPhysicalClearanceAsync(
        Guid robotId, string operatorId, ImmutableArray<string>? resourceIds = null, CancellationToken ct = default) =>
        EnqueueAsync(s =>
        {
            var result = s.ReleaseAfterPhysicalClearance(robotId, operatorId, resourceIds);
            PublishGranted(s); // promoted waiters
            return result;
        }, ct);

    public Task<TrafficOpResult> CancelRequestAsync(Guid robotId, Guid? requestId = null, CancellationToken ct = default) =>
        EnqueueAsync(s => s.CancelRequest(robotId, requestId), ct);

    public Task<TrafficOpResult> MarkBlockedAsync(Guid robotId, string reason, CancellationToken ct = default) =>
        EnqueueAsync(s => s.MarkBlocked(robotId, reason), ct);

    public Task<TrafficOpResult> MarkOfflineAsync(Guid robotId, CancellationToken ct = default) =>
        EnqueueAsync(s => s.MarkOffline(robotId), ct);

    public Task<TrafficOpResult> ReconcileRobotAsync(
        Guid robotId, double poseX, double poseY, bool localizationOk, ImmutableArray<int> occupiedEdges,
        CancellationToken ct = default) =>
        EnqueueAsync(s => s.ReconcileRobot(robotId, poseX, poseY, localizationOk, occupiedEdges), ct);

    public Task<TrafficSnapshot> GetTrafficSnapshotAsync(CancellationToken ct = default) =>
        EnqueueAsync(s => s.Snapshot(), ct);

    private async Task<T> EnqueueAsync<T>(Func<TrafficState, T> action, CancellationToken ct)
    {
        EnsureStarted();
        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var item = new WorkItem(state =>
        {
            try
            {
                tcs.TrySetResult(action(state));
            }
            catch (Exception ex)
            {
                tcs.TrySetException(ex);
            }
        });

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(_options.InboxOfferTimeoutMs);

        try
        {
            await _inbox.Writer.WriteAsync(item, timeoutCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            if (typeof(T) == typeof(AcquireResult))
            {
                return (T)(object)AcquireResult.Reject("OVERLOADED", TrafficWaitingReason.Overloaded);
            }

            if (typeof(T) == typeof(TrafficOpResult))
            {
                return (T)(object)TrafficOpResult.Fail("OVERLOADED");
            }

            if (typeof(T) == typeof(TrafficSnapshot))
            {
                return (T)(object)new TrafficSnapshot(
                    _state.Epoch, _state.StateVersion, "Overloaded", [], [], [], [], ["OVERLOADED"]);
            }

            throw new InvalidOperationException("OVERLOADED");
        }

        return await tcs.Task.WaitAsync(ct).ConfigureAwait(false);
    }

    private void EnsureStarted()
    {
        if (_started == 0)
        {
            // Allow unit tests / direct use without IHostedService.
            _ = StartAsync(CancellationToken.None);
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        try
        {
            await foreach (var item in _inbox.Reader.ReadAllAsync(ct).ConfigureAwait(false))
            {
                item.Execute(_state);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // shutdown
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Segmented traffic coordinator loop crashed");
        }
    }

    private sealed class WorkItem(Action<TrafficState> execute)
    {
        public void Execute(TrafficState state) => execute(state);
    }
}
