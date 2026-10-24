using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public class TrafficCoordinatorTests
{
    private static CompiledTrafficGraph SingleLaneGraph()
    {
        var input = new TrafficCompileInput(
            "MAP-TEST",
            "map",
            [
                new RouteGraphEdgeInput(
                    "E-1",
                    [new RoutePoint(0, 0), new RoutePoint(2, 0)],
                    EdgeDirection.BIDIRECTIONAL,
                    null,
                    true)
            ],
            [new RouteGraphEndpointInput("EP-A", 0, 0, true), new RouteGraphEndpointInput("EP-B", 2, 0, true)],
            [],
            [new TrafficLaneMeta("E-1", WidthMeters: 1.0, Capacity: 1, EdgeDirection.BIDIRECTIONAL)],
            [],
            TrafficFootprintOptions.Default);
        return TrafficGraphCompiler.Compile(input).Graph;
    }

    [Fact]
    public void Second_robot_waits_on_same_lane_then_gets_grant_after_release()
    {
        var graph = SingleLaneGraph();
        var start = graph.Stations.Single(s => s.EndpointCode == "EP-A").NodeId;
        var goal = graph.Stations.Single(s => s.EndpointCode == "EP-B").NodeId;
        var mapId = Guid.NewGuid();
        var robotA = Guid.NewGuid();
        var robotB = Guid.NewGuid();
        var stepA = Guid.NewGuid();
        var stepB = Guid.NewGuid();
        var coordinator = new TrafficCoordinator();

        var first = coordinator.TryAcquireRouteGrant(
            robotA, mapId, graph, start, goal, stepA,
            new PendingNavigateContext(Guid.NewGuid(), 2, 0, 0));
        Assert.True(first.Granted);
        Assert.False(first.WaitQueued);
        Assert.NotEmpty(first.EdgeIds);

        var second = coordinator.TryAcquireRouteGrant(
            robotB, mapId, graph, start, goal, stepB,
            new PendingNavigateContext(Guid.NewGuid(), 2, 0, 0));
        Assert.False(second.Granted);
        Assert.True(second.WaitQueued);

        coordinator.ReleaseGrant(robotA);
        var ready = coordinator.TakeReadyNavigates();
        var promoted = Assert.Single(ready);
        Assert.Equal(robotB, promoted.RobotId);
        Assert.Equal(stepB, promoted.JobStepId);
        Assert.Equal(first.GraphHash, promoted.GraphHash);
        Assert.Equal(first.EdgeIds, promoted.EdgeIds);
    }

    [Fact]
    public void Offline_release_frees_lane_for_waiter()
    {
        var graph = SingleLaneGraph();
        var start = graph.Stations.Single(s => s.EndpointCode == "EP-A").NodeId;
        var goal = graph.Stations.Single(s => s.EndpointCode == "EP-B").NodeId;
        var mapId = Guid.NewGuid();
        var robotA = Guid.NewGuid();
        var robotB = Guid.NewGuid();
        var coordinator = new TrafficCoordinator();

        Assert.True(coordinator.TryAcquireRouteGrant(robotA, mapId, graph, start, goal, Guid.NewGuid()).Granted);
        Assert.True(coordinator.TryAcquireRouteGrant(
            robotB, mapId, graph, start, goal, Guid.NewGuid(),
            new PendingNavigateContext(Guid.NewGuid(), 2, 0, 0)).WaitQueued);

        coordinator.ReleaseAllForOfflineRobot(robotA);
        Assert.Equal(robotB, Assert.Single(coordinator.TakeReadyNavigates()).RobotId);
    }

    [Fact]
    public void Release_by_job_step_promotes_waiter()
    {
        var graph = SingleLaneGraph();
        var start = graph.Stations.Single(s => s.EndpointCode == "EP-A").NodeId;
        var goal = graph.Stations.Single(s => s.EndpointCode == "EP-B").NodeId;
        var mapId = Guid.NewGuid();
        var stepA = Guid.NewGuid();
        var stepB = Guid.NewGuid();
        var coordinator = new TrafficCoordinator();

        Assert.True(coordinator.TryAcquireRouteGrant(Guid.NewGuid(), mapId, graph, start, goal, stepA).Granted);
        Assert.True(coordinator.TryAcquireRouteGrant(
            Guid.NewGuid(), mapId, graph, start, goal, stepB,
            new PendingNavigateContext(Guid.NewGuid(), 2, 0, 0)).WaitQueued);

        coordinator.ReleaseByJobStep(stepA);
        Assert.Equal(stepB, Assert.Single(coordinator.TakeReadyNavigates()).JobStepId);
    }
}
