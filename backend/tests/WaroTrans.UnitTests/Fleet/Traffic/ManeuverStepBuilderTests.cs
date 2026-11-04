using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using Xunit;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public sealed class ManeuverStepBuilderTests
{
    [Fact]
    public void Empty_edges_yield_no_steps()
    {
        var graph = CompileSimple();
        Assert.Empty(ManeuverStepBuilder.Build(graph, []));
    }

    [Fact]
    public void Straight_segment_is_single_Forward()
    {
        var graph = CompileSimple();
        // One directed edge only (bidirectional compile creates a reverse twin — do not chain both).
        var edge = graph.Edges.First(e => e.StartId != e.EndId);
        var steps = ManeuverStepBuilder.Build(graph, [edge.Id]);
        Assert.Single(steps);
        Assert.Equal(TrafficManeuverKind.Forward, steps[0].Kind);
        Assert.Equal(new[] { edge.Id }, steps[0].EdgeIds.ToList());
    }

    [Fact]
    public void Payload_kind_strings_match_mqtt_contract()
    {
        var step = new TrafficManeuverStep(
            TrafficManeuverKind.Spin,
            ImmutableArray<int>.Empty,
            Math.PI / 2,
            ["node:1"]);
        var payload = ManeuverStepBuilder.ToPayload([step]);
        Assert.Equal("Spin", payload[0].Kind);
        Assert.Equal(Math.PI / 2, payload[0].YawTarget);
    }

    private static CompiledTrafficGraph CompileSimple()
    {
        var edges = new List<RouteGraphEdgeInput>
        {
            new("L1", [new RoutePoint(0, 0), new RoutePoint(2, 0)], EdgeDirection.BIDIRECTIONAL, null, true)
        };
        var endpoints = new List<RouteGraphEndpointInput>
        {
            new("EP-A", 0, 0, true),
            new("EP-B", 2, 0, true)
        };
        var input = new TrafficCompileInput(
            "t",
            "map",
            edges,
            endpoints,
            [],
            [new TrafficLaneMeta("L1", 0.8, EdgeDirection.BIDIRECTIONAL)],
            [],
            TrafficFootprintOptions.Default);
        return TrafficGraphCompiler.Compile(input).Graph;
    }
}
