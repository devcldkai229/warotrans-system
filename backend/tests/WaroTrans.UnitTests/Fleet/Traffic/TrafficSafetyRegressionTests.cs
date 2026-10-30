using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>Regression tests for the 2026-10-28 audit reservation defects (T1–T3, T7, T11–T14, T16).</summary>
public class TrafficSafetyRegressionTests
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

    /// <summary>EP-A (0,0) — EP-M1 (2,0) — EP-M2 (4,0) — EP-B (6,0): every station is a safe stop.</summary>
    private static CompiledTrafficGraph BuildFourStopLine()
    {
        RouteGraphEdgeInput[] edges =
        [
            new("E-1", [new RoutePoint(0, 0), new RoutePoint(2, 0)], EdgeDirection.BIDIRECTIONAL, null, true),
            new("E-2", [new RoutePoint(2, 0), new RoutePoint(4, 0)], EdgeDirection.BIDIRECTIONAL, null, true),
            new("E-3", [new RoutePoint(4, 0), new RoutePoint(6, 0)], EdgeDirection.BIDIRECTIONAL, null, true)
        ];
        RouteGraphEndpointInput[] endpoints =
        [
            new("EP-A", 0, 0, true), new("EP-M1", 2, 0, true), new("EP-M2", 4, 0, true), new("EP-B", 6, 0, true)
        ];
        return TrafficGraphCompiler.Compile(new TrafficCompileInput(
            "LINE4", "map", edges, endpoints, [],
            edges.Select(e => new TrafficLaneMeta(e.Code, 1.0, e.Direction)).ToList(),
            [], TrafficFootprintOptions.Default)).Graph;
    }

    private static int Station(FakeRobotSim sim, string code) =>
        sim.Graph.Stations.First(s => s.EndpointCode == code).NodeId;

    private static RobotTrafficView View(FakeRobotSim sim, Guid robot) =>
        sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);

    private static AcquireResult StartRoute(FakeRobotSim sim, Guid robot, double x, double y, string goalCode)
    {
        var plan = sim.Plan(robot, x, y, Station(sim, goalCode));
        Assert.True(plan.Ok);
        var goal = sim.Graph.NodeById[Station(sim, goalCode)];
        return sim.State.AcquireRoute(plan.Segments, new TrafficRouteGoal(goal.X, goal.Y, 0), sim.Epoch);
    }

    private static TrafficOpResult StopAtGoal(FakeRobotSim sim, Guid robot)
    {
        var authority = View(sim, robot).Authority!;
        var node = sim.Graph.NodeById[authority.GoalSafeStopNodeId];
        return sim.State.ReportStoppedAwaiting(robot, authority.Seq, sim.Epoch, node.X, node.Y, true);
    }

    // ---------------------------------------------------------------- T1

    [Fact]
    public void T1_move_start_keeps_the_station_hold_and_the_floor_under_the_robot()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var hold = $"node:{Station(sim, "EP-M1")}";
        Assert.True(sim.State.EnsureTracked(robot, 2, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, hold).Ok);
        var before = View(sim, robot).OccupiedResourceIds;

        Assert.True(sim.State.EnsureTracked(robot, 2, 0, true).Ok); // next MOVE starts

        Assert.Equal(before.ToArray(), View(sim, robot).OccupiedResourceIds.ToArray());
        Assert.Contains(hold, View(sim, robot).OccupiedResourceIds);
    }

    [Fact]
    public void T1_move_start_never_lifts_a_quarantine()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-M1").Granted);
        sim.State.CancelRequest(robot, null); // CANCEL_WHILE_OCCUPIED

        var result = sim.State.EnsureTracked(robot, 1, 0, true);

        Assert.False(result.Ok);
        Assert.StartsWith("QUARANTINED", result.Reason);
        Assert.Equal(TrafficRobotPhase.Quarantined, View(sim, robot).Phase);
    }

    [Fact]
    public void T1_untracked_robot_is_seeded_so_another_robot_cannot_drive_through_it()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var parked = Guid.NewGuid();
        Assert.True(sim.State.EnsureTracked(parked, 3, 0, true).Ok); // parked mid E-2

        var mover = Guid.NewGuid();
        var plan = sim.Plan(mover, 0, 0, Station(sim, "EP-B"));
        var crossing = plan.Segments.First(s => s.EdgeIds.Any(id => sim.Graph.EdgeById[id].EdgeCodes.Contains("E-2")));
        var result = sim.State.AcquireAtomic(crossing, sim.Epoch, null);

        Assert.False(result.Granted);
        Assert.Equal(parked, result.BlockingOwner);
    }

    // ---------------------------------------------------------------- T2

    [Fact]
    public void T2_reconcile_keeps_resources_under_the_robot_and_releases_only_what_it_left()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-M1").Granted);
        var laneUnder = $"lane:E-1";

        // Robot reports idle while still standing on E-1 (1,0).
        Assert.True(sim.State.ReconcileRobot(robot, 1, 0, true, [], robotReportsIdle: true).Ok);

        Assert.Contains(laneUnder, View(sim, robot).OccupiedResourceIds);
        Assert.Null(View(sim, robot).Authority);
    }

    [Fact]
    public void T2_reconcile_of_an_executing_robot_keeps_its_authority()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var grant = StartRoute(sim, robot, 0, 0, "EP-M1");
        Assert.True(grant.Granted);

        Assert.True(sim.State.ReconcileRobot(robot, 1, 0, true, [], robotReportsIdle: false).Ok);

        Assert.Equal(grant.Authority!.AuthorityId, View(sim, robot).Authority?.AuthorityId);
    }

    [Fact]
    public void T2_booting_robot_without_telemetry_is_not_quarantined_when_it_holds_nothing()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();

        // authority_state arrives before the first telemetry: pose not trusted, but nothing is at risk.
        Assert.False(sim.State.ReconcileRobot(robot, 0, 0, localizationOk: false, [], robotReportsIdle: true).Ok);

        Assert.NotEqual(TrafficRobotPhase.Quarantined, View(sim, robot).Phase);
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok); // the next MOVE still works
    }

    [Fact]
    public void T2_unlocalized_robot_holding_resources_is_quarantined()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-M1").Granted);

        Assert.False(sim.State.ReconcileRobot(robot, 1, 0, localizationOk: false, [], robotReportsIdle: true).Ok);

        Assert.Equal(TrafficRobotPhase.Quarantined, View(sim, robot).Phase);
        Assert.NotEmpty(View(sim, robot).OccupiedResourceIds);
    }

    // ---------------------------------------------------------------- T3

    [Fact]
    public void T3_head_on_extension_deadlock_is_rejected_not_granted()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var east = Guid.NewGuid();
        var west = Guid.NewGuid();
        Assert.True(StartRoute(sim, east, 0, 0, "EP-B").Granted);  // segment A → M1
        Assert.True(StartRoute(sim, west, 6, 0, "EP-A").Granted);  // segment B → M2

        var eastExtend = StopAtGoal(sim, east);   // wants M1 → M2: M2 is held by west
        Assert.False(eastExtend.Ok);
        Assert.Equal(west, View(sim, east).BlockingOwner);

        var westExtend = StopAtGoal(sim, west);   // wants M2 → M1: M1 held by east, east waits for west
        Assert.False(westExtend.Ok);
        Assert.Equal("DEADLOCK_RISK", westExtend.Reason);
        Assert.DoesNotContain(View(sim, west).Authority!.EdgeIds, id => sim.Graph.EdgeById[id].EdgeCodes.Contains("E-2"));
    }

    // ---------------------------------------------------------------- T7

    [Fact]
    public void T7_exit_blocked_waiter_is_promoted_when_the_blocker_leaves()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var blocker = Guid.NewGuid();
        Assert.True(sim.State.EnsureTracked(blocker, 2, 0, true).Ok); // parked on EP-M1

        var waiter = Guid.NewGuid();
        var first = StartRoute(sim, waiter, 0, 0, "EP-M1");
        Assert.True(first.Queued);

        // Blocker is moved away by an operator (verified clearance): the waiter must be woken up.
        Assert.True(sim.State.ReleaseAfterPhysicalClearance(blocker, "op", null).Ok);

        Assert.NotNull(View(sim, waiter).Authority);
    }

    // ---------------------------------------------------------------- T11

    [Fact]
    public void T11_resource_is_not_released_inside_the_localization_margin()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Active, LocalizationMarginMeters = 0.05 };
        var sim = new FakeRobotSim(BuildFourStopLine(), options);
        var robot = Guid.NewGuid();
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-B").Granted);
        while (StopAtGoal(sim, robot).Ok)
        {
        }

        var turnRadius = sim.Graph.Footprint.TurnRadius;
        var seq = View(sim, robot).Authority!.Seq;
        // 2 cm beyond the bare turn radius from the end of E-1 (2,0): still inside the margin.
        Assert.True(sim.State.ReportSafeStopReached(robot, seq, sim.Epoch, 2 + turnRadius + 0.02, 0, true).Ok);

        Assert.Contains("lane:E-1", View(sim, robot).OccupiedResourceIds);
    }

    // ---------------------------------------------------------------- T12

    [Fact]
    public void T12_result_of_an_older_navigate_does_not_finish_the_current_route()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var grant = StartRoute(sim, robot, 0, 0, "EP-M1");

        var stale = sim.State.CompleteRoute(robot, succeeded: false, "CONTROLLER_FAILED", Guid.NewGuid());

        Assert.Equal("AUTHORITY_MISMATCH", stale.Reason);
        Assert.Equal(grant.Authority!.AuthorityId, View(sim, robot).Authority?.AuthorityId);
        Assert.NotEqual(TrafficRobotPhase.Quarantined, View(sim, robot).Phase);
    }

    // ---------------------------------------------------------------- T13

    [Fact]
    public void T13_quarantine_revokes_the_authority()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-M1").Granted);
        sim.State.DrainEvents();

        sim.State.MarkBlocked(robot, "OBSTACLE");

        var revoke = Assert.Single(sim.State.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityRevoked);
        Assert.Equal(robot, revoke.RobotId);
        Assert.Null(View(sim, robot).Authority);
        Assert.NotEmpty(View(sim, robot).OccupiedResourceIds); // occupancy stays (fail-closed)
        Assert.Empty(sim.State.ActiveAuthorityKeys());          // no renew of a revoked authority
    }

    [Fact]
    public void T13_localization_loss_keeps_the_authority_for_in_place_recovery()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var grant = StartRoute(sim, robot, 0, 0, "EP-M1");
        sim.State.DrainEvents();

        sim.State.ReportProgress(robot, grant.Authority!.Seq, sim.Epoch, null, 1, 0, localizationOk: false);

        Assert.DoesNotContain(sim.State.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityRevoked);
        Assert.NotNull(View(sim, robot).Authority);
    }

    // ---------------------------------------------------------------- T14

    [Fact]
    public async Task T14_grant_is_never_dropped_by_a_flood_of_renew_events()
    {
        var outbox = new TrafficEventOutbox(16);
        var authority = new MotionAuthority(Guid.NewGuid(), Guid.NewGuid(), 1, 2, [1], ["r"], [2], 1, 1, "h");
        outbox.Publish(new TrafficEvent(TrafficEventKind.AuthorityGranted, authority.RobotId, "R", authority,
            null, null, null, null, null, null, null, true));
        for (var i = 0; i < 100; i++)
        {
            outbox.Publish(new TrafficEvent(TrafficEventKind.AuthorityRenewed, authority.RobotId, "R", authority,
                null, null, null, null, null, null, null, false));
        }

        await using var e = outbox.ReadAllAsync(CancellationToken.None).GetAsyncEnumerator();
        Assert.True(await e.MoveNextAsync());
        Assert.Equal(TrafficEventKind.AuthorityGranted, e.Current.Kind);
    }

    // ---------------------------------------------------------------- T16

    [Fact]
    public void T16_graph_cannot_be_swapped_while_a_robot_holds_resources()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok);

        var other = FakeRobotSim.BuildNarrowBidirectional();
        Assert.Equal("GRAPH_IN_USE", sim.State.BindGraph(Guid.NewGuid(), other).Reason);
        Assert.Same(sim.Graph, sim.State.Graph);
    }

    // ---------------------------------------------------------------- N4 station-hold lifecycle

    [Fact]
    public void N4_stale_inbound_hold_releases_only_after_physical_clearance()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var inbound = $"node:{Station(sim, "EP-A")}";
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, inbound).Ok);

        // Still standing on the bay — must keep the hold (station departure gate).
        Assert.True(sim.State.ReleaseStaleServiceHolds(
            robot, ImmutableArray<string>.Empty, 0, 0, true).Ok);
        Assert.Contains(inbound, View(sim, robot).OccupiedResourceIds);

        // Far from EP-A (at EP-B) with keep=[] — verified clear → release.
        Assert.True(sim.State.ReleaseStaleServiceHolds(
            robot, ImmutableArray<string>.Empty, 6, 0, true).Ok);
        Assert.DoesNotContain(inbound, View(sim, robot).OccupiedResourceIds);
    }

    [Fact]
    public void N4_safe_stop_does_not_release_service_hold_T11()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var inbound = $"node:{Station(sim, "EP-A")}";
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, inbound).Ok);
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-M1").Granted);

        var auth = View(sim, robot).Authority!;
        var goal = sim.Graph.NodeById[auth.GoalSafeStopNodeId];
        Assert.True(sim.State.ReportSafeStopReached(robot, auth.Seq, sim.Epoch, goal.X, goal.Y, true).Ok);

        Assert.Contains(inbound, View(sim, robot).OccupiedResourceIds);
    }

    [Fact]
    public void N4_complete_route_keeps_service_hold_until_stale_release()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var inbound = $"node:{Station(sim, "EP-A")}";
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, inbound).Ok);
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-M1").Granted);

        Assert.True(sim.State.CompleteRoute(robot, succeeded: true, null).Ok);
        Assert.Contains(inbound, View(sim, robot).OccupiedResourceIds);

        Assert.True(sim.State.ReleaseStaleServiceHolds(
            robot, ImmutableArray<string>.Empty, 6, 0, true).Ok);
        Assert.DoesNotContain(inbound, View(sim, robot).OccupiedResourceIds);
    }

    [Fact]
    public void N4_multi_stop_keeps_next_bay_releases_previous_when_clear()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var inbound = $"node:{Station(sim, "EP-A")}";
        var shelf = $"node:{Station(sim, "EP-M2")}";
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, inbound).Ok);

        // EP-M1 (2,0) still touches E-1 on the inbound node resource — not clear yet.
        // EP-M2 (4,0) is past E-1 → physically clear of inbound; keep only the shelf hold.
        Assert.True(sim.State.EnsureTracked(robot, 4, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, shelf).Ok);
        Assert.True(sim.State.ReleaseStaleServiceHolds(
            robot, ImmutableArray.Create(shelf), 4, 0, true).Ok);

        Assert.DoesNotContain(inbound, View(sim, robot).OccupiedResourceIds);
        Assert.Contains(shelf, View(sim, robot).OccupiedResourceIds);
    }

    [Fact]
    public void N4_failed_navigate_keeps_hold_until_clearance_or_operator()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var inbound = $"node:{Station(sim, "EP-A")}";
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, inbound).Ok);
        Assert.True(StartRoute(sim, robot, 0, 0, "EP-M1").Granted);

        Assert.True(sim.State.CompleteRoute(robot, succeeded: false, "CONTROLLER_FAILED").Ok);
        Assert.Equal(TrafficRobotPhase.Quarantined, View(sim, robot).Phase);
        Assert.Contains(inbound, View(sim, robot).OccupiedResourceIds);

        // Quarantined: ReleaseStaleServiceHolds must refuse (no premature empty bay).
        Assert.False(sim.State.ReleaseStaleServiceHolds(
            robot, ImmutableArray<string>.Empty, 6, 0, true).Ok);

        Assert.True(sim.State.ReleaseAfterPhysicalClearance(robot, "op", null).Ok);
        Assert.DoesNotContain(inbound, View(sim, robot).OccupiedResourceIds);
    }

    [Fact]
    public void N4_cancel_quarantines_and_does_not_empty_the_bay()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var robot = Guid.NewGuid();
        var inbound = $"node:{Station(sim, "EP-A")}";
        Assert.True(sim.State.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(robot, inbound).Ok);

        Assert.True(sim.State.CancelRequest(robot, null).Ok);
        Assert.Equal(TrafficRobotPhase.Quarantined, View(sim, robot).Phase);
        Assert.Contains(inbound, View(sim, robot).OccupiedResourceIds);
        Assert.False(sim.State.ReleaseStaleServiceHolds(
            robot, ImmutableArray<string>.Empty, 6, 0, true).Ok);
    }

    [Fact]
    public void N4_second_robot_waits_then_acquires_after_verified_release()
    {
        var sim = new FakeRobotSim(BuildFourStopLine());
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();
        var inbound = $"node:{Station(sim, "EP-A")}";

        Assert.True(sim.State.EnsureTracked(first, 0, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(first, inbound).Ok);

        Assert.True(sim.State.EnsureTracked(second, 6, 0, true).Ok);
        var blocked = sim.State.HoldServiceResource(second, inbound);
        Assert.False(blocked.Ok);

        Assert.True(sim.State.ReleaseStaleServiceHolds(
            first, ImmutableArray<string>.Empty, 6, 0, true).Ok);
        Assert.True(sim.State.HoldServiceResource(second, inbound).Ok);
        Assert.Contains(inbound, View(sim, second).OccupiedResourceIds);
        Assert.DoesNotContain(inbound, View(sim, first).OccupiedResourceIds);
    }
}
