using System.Collections.Immutable;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>Deterministic fake-robot driver for segmented traffic tests.</summary>
public sealed class FakeRobotSim
{
    private readonly TrafficState _state;
    private readonly RoutePlanner _planner;
    private readonly CompiledTrafficGraph _graph;
    private readonly Guid _mapVersionId;
    private readonly FakeTimeProvider _clock;

    public FakeRobotSim(
        CompiledTrafficGraph graph,
        TrafficOptions? options = null,
        FakeTimeProvider? clock = null)
    {
        _graph = graph;
        _mapVersionId = Guid.NewGuid();
        _clock = clock ?? new FakeTimeProvider();
        var opts = options ?? new TrafficOptions { Mode = TrafficCoordinatorMode.Active };
        // Active in unit tests so multi-robot scenarios are exercisable.
        opts.Mode = TrafficCoordinatorMode.Active;
        _state = new TrafficState(opts, _clock);
        _planner = new RoutePlanner(opts);
        _state.BeginEpoch(1);
        _state.BindGraph(_mapVersionId, graph);
        _state.CompleteReconciliation([]);
    }

    public TrafficState State => _state;
    public CompiledTrafficGraph Graph => _graph;
    public Guid MapVersionId => _mapVersionId;
    public FakeTimeProvider Clock => _clock;
    public long Epoch => _state.Epoch;

    public RoutePlanResult Plan(Guid robotId, double x, double y, int goalNodeId, int priority = 0, Guid? requestId = null)
    {
        var req = new RoutePlanRequest(
            requestId ?? Guid.NewGuid(),
            robotId,
            _mapVersionId,
            _graph,
            x,
            y,
            null,
            goalNodeId,
            priority);
        return _planner.Plan(req, _state.CongestionSnapshot(), _state.StateVersion);
    }

    public AcquireResult AcquireNextSegment(Guid robotId, double x, double y, int goalNodeId, int priority = 0, Guid? requestId = null)
    {
        var plan = Plan(robotId, x, y, goalNodeId, priority, requestId);
        if (!plan.Ok || plan.Segments.Length == 0)
        {
            return AcquireResult.Reject(plan.Reason ?? "UNREACHABLE");
        }

        return _state.AcquireAtomic(plan.Segments[0], Epoch, null);
    }

    public void AdvanceTime(TimeSpan delta) => _clock.Advance(delta);

    public static CompiledTrafficGraph BuildCorridorGraph()
    {
        // A --lane-- J --lane-- B with a junction zone in the middle.
        RouteGraphEdgeInput[] edges =
        [
            new("E-W", [new RoutePoint(0, 0), new RoutePoint(2, 0)], EdgeDirection.BIDIRECTIONAL, null, true),
            new("E-E", [new RoutePoint(2, 0), new RoutePoint(4, 0)], EdgeDirection.BIDIRECTIONAL, null, true)
        ];
        RouteGraphEndpointInput[] endpoints =
        [
            new("EP-A", 0, 0, true),
            new("EP-B", 4, 0, true)
        ];
        RouteGraphZoneInput[] zones =
        [
            new("Z-J", ZoneType.JUNCTION,
                [new(1.8, -0.3), new(2.2, -0.3), new(2.2, 0.3), new(1.8, 0.3), new(1.8, -0.3)],
                null, true)
        ];

        var input = new TrafficCompileInput(
            "SIM",
            "map",
            edges,
            endpoints,
            zones,
            edges.Select(e => new TrafficLaneMeta(e.Code, 1.0, 1, e.Direction)).ToList(),
            zones.Select(z => new TrafficZoneMeta(z.Code, z.ZoneType, 1)).ToList(),
            TrafficFootprintOptions.Default);

        return TrafficGraphCompiler.Compile(input).Graph;
    }

    public static CompiledTrafficGraph BuildNarrowBidirectional()
    {
        RouteGraphEdgeInput[] edges =
        [
            new("E-NARROW", [new RoutePoint(0, 0), new RoutePoint(5, 0)], EdgeDirection.BIDIRECTIONAL, null, true)
        ];
        RouteGraphEndpointInput[] endpoints =
        [
            new("EP-A", 0, 0, true),
            new("EP-B", 5, 0, true)
        ];
        var input = new TrafficCompileInput(
            "NARROW",
            "map",
            edges,
            endpoints,
            [],
            [new TrafficLaneMeta("E-NARROW", 0.5, 1, EdgeDirection.BIDIRECTIONAL)],
            [],
            TrafficFootprintOptions.Default);
        return TrafficGraphCompiler.Compile(input).Graph;
    }

    public static CompiledTrafficGraph BuildThreeWayJunction()
    {
        RouteGraphEdgeInput[] edges =
        [
            new("E-W", [new RoutePoint(0, 0), new RoutePoint(1, 0)], EdgeDirection.BIDIRECTIONAL, null, true),
            new("E-E", [new RoutePoint(1, 0), new RoutePoint(2, 0)], EdgeDirection.BIDIRECTIONAL, null, true),
            new("E-N", [new RoutePoint(1, 0), new RoutePoint(1, 1)], EdgeDirection.BIDIRECTIONAL, null, true)
        ];
        RouteGraphEndpointInput[] endpoints =
        [
            new("EP-A", 0, 0, true),
            new("EP-B", 2, 0, true),
            new("EP-C", 1, 1, true)
        ];
        RouteGraphZoneInput[] zones =
        [
            new("Z-J", ZoneType.JUNCTION,
                [new(0.85, -0.2), new(1.15, -0.2), new(1.15, 0.2), new(0.85, 0.2), new(0.85, -0.2)],
                null, true)
        ];
        var input = new TrafficCompileInput(
            "J3",
            "map",
            edges,
            endpoints,
            zones,
            edges.Select(e => new TrafficLaneMeta(e.Code, 1.0, 1, e.Direction)).ToList(),
            [new TrafficZoneMeta("Z-J", ZoneType.JUNCTION, 1)],
            TrafficFootprintOptions.Default);
        return TrafficGraphCompiler.Compile(input).Graph;
    }
}

/// <summary>Minimal TimeProvider for deterministic aging / fairness tests.</summary>
public sealed class FakeTimeProvider : TimeProvider
{
    private DateTimeOffset _now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan delta) => _now += delta;
}

public static class SegmentedCoordinatorFactory
{
    public static SegmentedTrafficCoordinator Create(TrafficOptions? options = null)
    {
        var opts = Options.Create(options ?? new TrafficOptions { Mode = TrafficCoordinatorMode.Active });
        return new SegmentedTrafficCoordinator(opts, NullLogger<SegmentedTrafficCoordinator>.Instance);
    }
}
