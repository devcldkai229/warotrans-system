using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>Active Mode route lifecycle: grant → (extend at safe stops) → NAVIGATE result.</summary>
public class TrafficActiveRouteTests
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    [Fact]
    public void Progress_with_pre_renew_seq_is_accepted()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        var grant = sim.State.AcquireRoute(segments, goal, sim.Epoch);
        Assert.True(grant.Granted);
        var grantSeq = grant.Authority!.Seq;

        Assert.True(sim.State.RenewAuthority(robot, grant.Authority.AuthorityId, sim.Epoch, Ttl).Ok);
        Assert.True(sim.State.RenewAuthority(robot, grant.Authority.AuthorityId, sim.Epoch, Ttl).Ok);

        // Robot has not applied the renews yet: it still reports the grant seq.
        Assert.True(sim.State.ReportProgress(robot, grantSeq, sim.Epoch, null, 1, 0, true).Ok);
        Assert.True(sim.State.ReportSafeStopReached(robot, grantSeq, sim.Epoch, 5, 0, true).Ok);
    }

    [Fact]
    public void Single_segment_route_grant_is_final_with_endpoint_pose()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var (segments, _) = PlanRoute(sim, robot, 0, 0, "EP-B");
        var goal = new TrafficRouteGoal(5, 0, 1.57);

        Assert.True(sim.State.AcquireRoute(segments, goal, sim.Epoch).Granted);

        var evt = Assert.Single(sim.State.DrainEvents());
        Assert.Equal(TrafficEventKind.AuthorityGranted, evt.Kind);
        Assert.True(evt.IsFirstSegment);
        Assert.True(evt.IsFinalSegment);
        Assert.Equal(5, evt.GoalX);
        Assert.Equal(1.57, evt.GoalYaw);
    }

    [Fact]
    public void Multi_segment_route_extends_on_advance_and_marks_last_extend_final()
    {
        var sim = new FakeRobotSim(BuildLineWithMidStation());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        Assert.True(segments.Length >= 2);

        var grant = sim.State.AcquireRoute(segments, goal, sim.Epoch);
        Assert.True(grant.Granted);
        var first = Assert.Single(sim.State.DrainEvents());
        Assert.False(first.IsFinalSegment);

        for (var i = 1; i < segments.Length; i++)
        {
            Assert.True(StopAtGoal(sim, robot).Ok);
            var extend = Assert.Single(sim.State.DrainEvents());
            Assert.Equal(TrafficEventKind.AuthorityExtended, extend.Kind);
            Assert.Equal(i == segments.Length - 1, extend.IsFinalSegment);
        }

        var authority = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot).Authority!;
        Assert.Equal(segments.SelectMany(s => s.EdgeIds).Distinct().Count(), authority.EdgeIds.Length);
        Assert.Equal("NO_PENDING_SEGMENT", StopAtGoal(sim, robot).Reason);
    }

    [Fact]
    public void Advance_without_a_stopped_report_is_refused()
    {
        var sim = new FakeRobotSim(BuildLineWithMidStation());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        Assert.True(sim.State.AcquireRoute(segments, goal, sim.Epoch).Granted);

        Assert.Equal("NOT_AWAITING", sim.State.AdvanceRoute(robot).Reason);
    }

    [Fact]
    public void T9_duplicate_stopped_awaiting_does_not_grant_a_second_extension()
    {
        var sim = new FakeRobotSim(BuildLineWithMidStation());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        Assert.True(sim.State.AcquireRoute(segments, goal, sim.Epoch).Granted);
        var view = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        var staleSeq = view.Authority!.Seq;
        var mid = sim.Graph.NodeById[view.Authority.GoalSafeStopNodeId];

        Assert.True(sim.State.ReportStoppedAwaiting(robot, staleSeq, sim.Epoch, mid.X, mid.Y, true).Ok);
        var edgesAfterFirst = Snapshot(sim, robot).Authority!.EdgeIds.Length;

        // Same message redelivered: below the floor set by the EXTEND it caused.
        Assert.Equal("STALE_SEQ", sim.State.ReportStoppedAwaiting(robot, staleSeq, sim.Epoch, mid.X, mid.Y, true).Reason);
        Assert.Equal(edgesAfterFirst, Snapshot(sim, robot).Authority!.EdgeIds.Length);
    }

    [Fact]
    public void T9_stopped_report_away_from_the_goal_safe_stop_does_not_extend()
    {
        var sim = new FakeRobotSim(BuildLineWithMidStation());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        Assert.True(sim.State.AcquireRoute(segments, goal, sim.Epoch).Granted);
        var seq = Snapshot(sim, robot).Authority!.Seq;

        Assert.Equal("NOT_AT_SAFE_STOP", sim.State.ReportStoppedAwaiting(robot, seq, sim.Epoch, 0.5, 0, true).Reason);
    }

    [Fact]
    public void T10_late_safe_stop_report_keeps_resources_ahead_of_the_robot()
    {
        var sim = new FakeRobotSim(BuildLineWithMidStation());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        Assert.True(sim.State.AcquireRoute(segments, goal, sim.Epoch).Granted);
        var seq = Snapshot(sim, robot).Authority!.Seq;
        Assert.True(StopAtGoal(sim, robot).Ok); // EXTEND to EP-B granted
        var lastEdge = Snapshot(sim, robot).Authority!.EdgeIds[^1];
        var ahead = sim.Graph.ResourcesCovering([lastEdge]);

        // The SAFE_STOP_REACHED for the mid stop arrives after the extension, robot still at EP-M (2,0).
        Assert.True(sim.State.ReportSafeStopReached(robot, Snapshot(sim, robot).Authority!.Seq, sim.Epoch, 2, 0, true).Ok);

        Assert.All(ahead, rid => Assert.Contains(rid, Snapshot(sim, robot).OccupiedResourceIds));
        _ = seq;
    }

    private static TrafficOpResult StopAtGoal(FakeRobotSim sim, Guid robot)
    {
        var authority = Snapshot(sim, robot).Authority!;
        var node = sim.Graph.NodeById[authority.GoalSafeStopNodeId];
        return sim.State.ReportStoppedAwaiting(robot, authority.Seq, sim.Epoch, node.X, node.Y, true);
    }

    private static RobotTrafficView Snapshot(FakeRobotSim sim, Guid robot) =>
        sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);

    [Fact]
    public void Safe_stop_releases_only_resources_the_robot_has_left()
    {
        var sim = new FakeRobotSim(BuildLineWithMidStation());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        var grant = sim.State.AcquireRoute(segments, goal, sim.Epoch);
        for (var i = 1; i < segments.Length; i++)
        {
            Assert.True(StopAtGoal(sim, robot).Ok);
        }

        var before = Occupied(sim, robot);
        var seq = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot).Authority!.Seq;
        Assert.True(sim.State.ReportSafeStopReached(robot, seq, sim.Epoch, 4, 0, true).Ok);

        var after = Occupied(sim, robot);
        Assert.NotEmpty(after); // the lane under the robot stays held
        Assert.True(after.Length < before.Length); // the far lane is released
        Assert.NotNull(sim.State.Snapshot().Robots.Single(r => r.RobotId == robot).Authority);
        _ = grant;
    }

    [Fact]
    public void Successful_route_completion_clears_authority_keeps_station_hold_and_stops_renew()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        var bay = $"node:{sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId}";
        Assert.True(sim.State.HoldServiceResource(robot, bay).Ok);
        Assert.True(sim.State.AcquireRoute(segments, goal, sim.Epoch).Granted);
        Assert.NotEmpty(sim.State.ActiveAuthorityKeys());
        sim.State.DrainEvents();

        Assert.True(sim.State.CompleteRoute(robot, succeeded: true, null).Ok);

        var view = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Null(view.Authority);
        Assert.Equal(TrafficRobotPhase.HoldingService, view.Phase);
        Assert.Contains(bay, view.OccupiedResourceIds);
        Assert.Empty(sim.State.ActiveAuthorityKeys());
        Assert.Contains(sim.State.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityReleased);
    }

    [Fact]
    public void Failed_route_completion_quarantines_and_keeps_occupancy()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var (segments, goal) = PlanRoute(sim, robot, 0, 0, "EP-B");
        Assert.True(sim.State.AcquireRoute(segments, goal, sim.Epoch).Granted);
        var held = Occupied(sim, robot);

        Assert.True(sim.State.CompleteRoute(robot, succeeded: false, "CONTROLLER_FAILED").Ok);

        var view = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, view.Phase);
        Assert.Equal(held.ToArray(), view.OccupiedResourceIds.ToArray());
    }

    private static (ImmutableArray<RouteSegmentCandidate> Segments, TrafficRouteGoal Goal) PlanRoute(
        FakeRobotSim sim, Guid robot, double x, double y, string endpointCode)
    {
        var station = sim.Graph.Stations.First(s => s.EndpointCode == endpointCode);
        var plan = sim.Plan(robot, x, y, station.NodeId);
        Assert.True(plan.Ok);
        var node = sim.Graph.NodeById[station.NodeId];
        return (plan.Segments, new TrafficRouteGoal(node.X, node.Y, 0));
    }

    private static ImmutableArray<string> Occupied(FakeRobotSim sim, Guid robot) =>
        sim.State.Snapshot().Robots.Single(r => r.RobotId == robot).OccupiedResourceIds;

    /// <summary>EP-A (0,0) — EP-M (2,0) — EP-B (4,0): EP-M is an intermediate safe stop.</summary>
    private static CompiledTrafficGraph BuildLineWithMidStation()
    {
        RouteGraphEdgeInput[] edges =
        [
            new("E-1", [new RoutePoint(0, 0), new RoutePoint(2, 0)], EdgeDirection.BIDIRECTIONAL, null, true),
            new("E-2", [new RoutePoint(2, 0), new RoutePoint(4, 0)], EdgeDirection.BIDIRECTIONAL, null, true)
        ];
        RouteGraphEndpointInput[] endpoints =
        [
            new("EP-A", 0, 0, true),
            new("EP-M", 2, 0, true),
            new("EP-B", 4, 0, true)
        ];
        var input = new TrafficCompileInput(
            "LINE",
            "map",
            edges,
            endpoints,
            [],
            edges.Select(e => new TrafficLaneMeta(e.Code, 1.0, e.Direction)).ToList(),
            [],
            TrafficFootprintOptions.Default);
        return TrafficGraphCompiler.Compile(input).Graph;
    }
}
