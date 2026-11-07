using System.Collections.Immutable;
using FluentValidation;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// Semantic mode binds zone/cell policy and no RouteGraph. EnsureTracked (called before every Semantic MOVE)
/// used to require a compiled graph, so a Job MOVE on a map with only a semantic bundle failed with NO_GRAPH.
/// </summary>
public class SemanticTrackingTests
{
    private static readonly SemanticZonePoly ZoneAroundOrigin = new(
        "ZONE-SINGLE-A",
        ImmutableArray.Create((-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)));

    private static SemanticTrafficPolicy Policy() =>
        new("fp-track", Guid.NewGuid(), "MAP-TEST", CellSizeMeters: 0.5, HorizonMeters: 4.0,
            FootprintHalfLength: 0.18, FootprintHalfWidth: 0.15, [ZoneAroundOrigin], []);

    private static TrafficState State()
    {
        var state = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 });
        state.BeginEpoch(1);
        Assert.True(state.BindSemanticPolicy(Policy()).Ok);
        return state;
    }

    [Fact]
    public void Robot_is_tracked_without_a_route_graph_and_holds_the_zone_it_stands_in()
    {
        var state = State();
        var a = Guid.NewGuid();

        var tracked = state.EnsureTracked(a, 0.0, 0.0, localizationOk: true);

        Assert.True(tracked.Ok, tracked.Reason);
        // A second robot standing in the same SINGLE_OCCUPANCY zone is a real conflict, not something to ignore.
        var b = state.EnsureTracked(Guid.NewGuid(), 0.2, 0.2, localizationOk: true);
        Assert.False(b.Ok);
        Assert.StartsWith("SEED_CONFLICT", b.Reason);
    }

    [Fact]
    public void Unlocalized_robot_is_still_refused()
    {
        var tracked = State().EnsureTracked(Guid.NewGuid(), 0.0, 0.0, localizationOk: false);

        Assert.False(tracked.Ok);
        Assert.Equal("POSE_UNCERTAIN", tracked.Reason);
    }

    [Fact]
    public void Nothing_bound_still_reports_no_graph()
    {
        var state = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 });
        state.BeginEpoch(1);

        Assert.Equal("NO_GRAPH", state.EnsureTracked(Guid.NewGuid(), 0.0, 0.0, true).Reason);
    }

    [Theory]
    [InlineData(null, "RBT-001")]
    [InlineData("", "RBT-001")]
    [InlineData("RBT-001", "RBT-001")]
    public void Uplink_robot_code_defaults_to_and_must_match_the_topic(string? payloadCode, string expected) =>
        Assert.Equal(expected, MqttSubscriberHostedService.MatchTopicRobotCode(payloadCode, "RBT-001"));

    [Fact]
    public void Uplink_from_another_robot_topic_is_rejected() =>
        // A RESULT on RBT-002's topic must not complete a command of RBT-001.
        Assert.Throws<ValidationException>(() => MqttSubscriberHostedService.MatchTopicRobotCode("RBT-001", "RBT-002"));

    [Theory]
    [InlineData("""{"x":1,"y":2,"yaw":0,"frameId":"map","route":null,"authority":null,"timeoutSeconds":60}""")]
    [InlineData("""{"route":{"edgeIds":null}}""")]
    [InlineData("null")]
    public void Open_semantic_navigate_payload_does_not_break_start_up_reconciliation(string payload)
    {
        // A Semantic NAVIGATE has no route/authority. Reconciliation parsed it at start-up and the Host crashed.
        Assert.Empty(TrafficShadowObserver.ParseRouteEdgeIds(payload));
        Assert.Empty(TrafficShadowObserver.ParseAuthorityEdgeIds(payload));
    }
}
