using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public class SemanticReservationTests
{
    private static SemanticTrafficPolicy Policy(params SemanticZonePoly[] zones) =>
        new(
            "fp-test",
            Guid.NewGuid(),
            "MAP-ONE-V001",
            CellSizeMeters: 0.5,
            HorizonMeters: 4.0,
            FootprintHalfLength: 0.18,
            FootprintHalfWidth: 0.15,
            zones.ToImmutableArray(),
            []);

    /// <summary>Bound, reconciled and open: the state a running Semantic host is in.</summary>
    private static TrafficState Ready(SemanticTrafficPolicy policy)
    {
        var state = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 });
        state.BeginEpoch(1);
        Assert.True(state.BindSemanticPolicy(policy).Ok);
        state.CompleteReconciliation([]);
        return state;
    }

    private static SemanticPlanProposeRequest Plan(
        SemanticTrafficPolicy policy, Guid robot, long revision, ImmutableArray<SemanticPlanPose> poses, Guid? command = null) =>
        new(Guid.NewGuid(), robot, "RBT", policy.SemanticMapFingerprint, revision, poses, null, null, null,
            CommandId: command ?? Guid.Empty);

    [Fact]
    public void CollectResources_hits_single_occupancy_zone()
    {
        var zone = new SemanticZonePoly(
            "Z-SO-1",
            ImmutableArray.Create((0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0), (0.0, 0.0)));
        var policy = Policy(zone);
        var poses = ImmutableArray.Create(
            new SemanticPlanPose(0.5, 0.5, 0),
            new SemanticPlanPose(1.0, 1.0, 0));
        var ids = SemanticReservation.CollectResources(policy, poses);
        Assert.Contains("zone:Z-SO-1", ids);
        Assert.Contains(ids, id => id.StartsWith("cell:", StringComparison.Ordinal));
    }

    [Fact]
    public void CollectResources_reserves_a_zone_the_robot_reaches_when_turning()
    {
        // Path runs 0.2 m beside the zone: the centre never enters it, a corner of the turning robot (0.23 m) does.
        var zone = new SemanticZonePoly("Z", ImmutableArray.Create((0.0, 0.2), (3.0, 0.2), (3.0, 2.0), (0.0, 2.0)));
        var policy = Policy(zone) with { PathToleranceMeters = 0 };
        var ids = SemanticReservation.CollectResources(
            policy, ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(2, 0, 0)));
        Assert.Contains("zone:Z", ids);
    }

    [Fact]
    public void CollectResources_horizon_limits_cells()
    {
        var policy = Policy() with { HorizonMeters = 1.0, CellSizeMeters = 0.5 };
        var poses = ImmutableArray.Create(
            new SemanticPlanPose(0, 0, 0),
            new SemanticPlanPose(0.4, 0, 0),
            new SemanticPlanPose(1.2, 0, 0),
            new SemanticPlanPose(10, 0, 0)); // beyond horizon
        var ids = SemanticReservation.CollectResources(policy, poses);
        Assert.DoesNotContain(ids, id => id.StartsWith("cell:19:", StringComparison.Ordinal) || id.StartsWith("cell:20:", StringComparison.Ordinal));
    }

    [Fact]
    public void Sparse_path_is_interpolated_so_no_cell_between_poses_is_skipped()
    {
        var policy = Policy() with { CellSizeMeters = 0.25, PathToleranceMeters = 0 };
        // Two poses 3 m apart: every cell under the straight line between them must be reserved.
        var ids = SemanticReservation.CollectResources(
            policy, ImmutableArray.Create(new SemanticPlanPose(0.1, 0.1, 0), new SemanticPlanPose(3.1, 0.1, 0)))
            .ToHashSet();
        for (var ix = 0; ix <= 12; ix++)
        {
            Assert.Contains(SemanticReservation.CellId(ix, 0), ids);
        }
    }

    [Fact]
    public void Reservation_covers_the_footprint_at_any_heading_anywhere_along_the_path()
    {
        var policy = Policy() with { CellSizeMeters = 0.25, PathToleranceMeters = 0.1 };
        var path = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(2, 1, 0));
        var reserved = SemanticReservation.CollectResources(policy, path).ToHashSet();
        // The robot (any heading) up to the tolerance off the path is inside what was reserved.
        for (var t = 0.0; t <= 1.0; t += 0.01)
        {
            var (x, y) = (2 * t, t);
            var nx = -1 / Math.Sqrt(5) * 0.1;
            var ny = 2 / Math.Sqrt(5) * 0.1;
            foreach (var (px, py) in new[] { (x, y), (x + nx, y + ny), (x - nx, y - ny) })
            {
                var under = new HashSet<string>();
                SemanticReservation.DiscCells(px, py, policy.FootprintRadiusMeters, policy.EffectiveCellSize, under);
                Assert.True(under.IsSubsetOf(reserved), $"footprint at ({px:F2},{py:F2}) leaves the reservation");
            }
        }
    }

    [Fact]
    public void AcquireSemanticPlan_exclusive_zone_second_robot_queues()
    {
        var zone = new SemanticZonePoly(
            "Z1",
            ImmutableArray.Create((0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)));
        var policy = Policy(zone);
        var state = Ready(policy);

        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();
        var poses = ImmutableArray.Create(new SemanticPlanPose(1, 1, 0), new SemanticPlanPose(1.2, 1, 0));
        var g1 = state.AcquireSemanticPlan(Plan(policy, r1, 1, poses));
        Assert.True(g1.Granted);
        Assert.Contains("zone:Z1", g1.Authority!.ResourceIds);

        var g2 = state.AcquireSemanticPlan(Plan(policy, r2, 1, poses));
        Assert.False(g2.Granted);
        Assert.True(g2.Queued);
    }

    [Fact]
    public void AcquireSemanticPlan_fingerprint_mismatch_rejects()
    {
        var policy = Policy();
        var state = Ready(policy);
        var bad = state.AcquireSemanticPlan(Plan(policy, Guid.NewGuid(), 1,
            ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0))) with
        {
            SemanticMapFingerprint = "wrong-fp"
        });
        Assert.False(bad.Granted);
        Assert.Equal("FINGERPRINT_MISMATCH", bad.Reason);
    }

    [Fact]
    public void Plan_without_a_backend_command_is_not_granted()
    {
        var policy = Policy();
        var state = Ready(policy);
        var standalone = state.AcquireSemanticPlan(Plan(policy, Guid.NewGuid(), 1,
            ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0))) with { CommandId = null });
        Assert.False(standalone.Granted);
        Assert.Equal("NO_ACTIVE_COMMAND", standalone.Reason);
    }

    [Fact]
    public void Physical_clearance_releases_cell()
    {
        var policy = Policy();
        var cells = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.DiscCells(0, 0, policy.FootprintRadiusMeters, 0.5, cells);
        Assert.NotEmpty(cells);
        Assert.True(SemanticReservation.IsPhysicallyClearOfResources(policy, 10, 10, cells, margin: 0.05));
        Assert.False(SemanticReservation.IsPhysicallyClearOfResources(policy, 0, 0, cells, margin: 0.05));
        Assert.False(SemanticReservation.IsPhysicallyClearOfResources(policy, 10, 10, ["bay:X"], margin: 0.05));
    }

    [Fact]
    public void Reconnect_after_offline_needs_a_localized_pose_inside_what_the_robot_holds()
    {
        var policy = Policy();
        var state = Ready(policy);
        var robot = Guid.NewGuid();
        Assert.True(state.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(state.MarkOffline(robot).Ok);

        var poses = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0));
        var rejected = state.AcquireSemanticPlan(Plan(policy, robot, 1, poses));
        Assert.Equal("QUARANTINED:OFFLINE", rejected.Reason);

        // Heartbeat alone (no fresh localized pose) does not lift it.
        Assert.False(state.MarkOnline(robot).Ok);
        Assert.Equal("RECONNECT_UNVERIFIED", state.Snapshot().Robots.Single(r => r.RobotId == robot).QuarantineReason);
        // And it now needs a reconcile, not another heartbeat.
        Assert.True(state.MarkOnline(robot, 0, 0, true).Ok);
        Assert.Equal(TrafficRobotPhase.Quarantined, state.Snapshot().Robots.Single(r => r.RobotId == robot).Phase);

        Assert.True(state.ReconcileRobot(robot, 0, 0, true, []).Ok);
        Assert.True(state.AcquireSemanticPlan(Plan(policy, robot, 2, poses)).Granted);
    }

    [Fact]
    public void Reconnect_inside_its_occupancy_recovers_but_somewhere_else_does_not()
    {
        var policy = Policy();
        var state = Ready(policy);
        var robot = Guid.NewGuid();
        Assert.True(state.EnsureTracked(robot, 0, 0, true).Ok);
        Assert.True(state.MarkOffline(robot).Ok);
        Assert.True(state.MarkOnline(robot, 0.02, 0.01, true).Ok);
        Assert.Equal(TrafficRobotPhase.Idle, state.Snapshot().Robots.Single(r => r.RobotId == robot).Phase);

        Assert.True(state.MarkOffline(robot).Ok);
        Assert.False(state.MarkOnline(robot, 4, 4, true).Ok); // pushed away while unreachable
        Assert.Equal("RECONNECT_UNVERIFIED", state.Snapshot().Robots.Single(r => r.RobotId == robot).QuarantineReason);
    }

    [Fact]
    public void AcquireSemanticPlan_does_not_clear_LOCALIZATION_LOSS_quarantine()
    {
        var policy = Policy();
        var state = Ready(policy);
        var robot = Guid.NewGuid();
        var poses = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0));
        var grant = state.AcquireSemanticPlan(Plan(policy, robot, 1, poses));
        Assert.True(grant.Granted);

        // Pose-less progress with localizationOk=false quarantines.
        Assert.True(state.ReportProgress(robot, grant.Authority!.Seq + 1, 1, null, 0.1, 0, localizationOk: false).Ok);
        var lost = state.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, lost.Phase);
        Assert.Equal("LOCALIZATION_LOSS", lost.QuarantineReason);

        // Fresh traffic_plan alone must NOT clear quarantine.
        var again = state.AcquireSemanticPlan(Plan(policy, robot, 2, poses));
        Assert.False(again.Granted);
        Assert.Equal("QUARANTINED:LOCALIZATION_LOSS", again.Reason);
        var still = state.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, still.Phase);
        Assert.Equal("LOCALIZATION_LOSS", still.QuarantineReason);
    }

    [Fact]
    public void AcquireSemanticPlan_replan_diff_releases_far_cells_and_promotes_waiter()
    {
        var policy = Policy() with { HorizonMeters = 1.0, CellSizeMeters = 0.5 };
        var state = Ready(policy);

        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();
        var pathA = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(0.8, 0, 0));
        var g1 = state.AcquireSemanticPlan(Plan(policy, r1, 1, pathA));
        Assert.True(g1.Granted);

        // Second robot wants overlapping first horizon → queues.
        var g2q = state.AcquireSemanticPlan(Plan(policy, r2, 1, pathA));
        Assert.True(g2q.Queued);

        // R1 (now at x=5, where its new plan starts) replans; the cells it left near origin are released and R2 is
        // promoted in the same step.
        var pathB = ImmutableArray.Create(new SemanticPlanPose(5.0, 0, 0), new SemanticPlanPose(5.5, 0, 0));
        Assert.True(state.AcquireSemanticPlan(Plan(policy, r1, 2, pathB)).Granted);

        var r2View = state.Snapshot().Robots.Single(r => r.RobotId == r2);
        Assert.Equal(TrafficRobotPhase.Authorized, r2View.Phase);
        Assert.NotNull(r2View.Authority);
    }

    [Fact]
    public void ReportVerifiedExit_works_without_graph_when_semantic_bound()
    {
        var policy = Policy();
        var state = Ready(policy);
        var robot = Guid.NewGuid();
        var poses = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(0.5, 0, 0));
        var grant = state.AcquireSemanticPlan(Plan(policy, robot, 1, poses));
        Assert.True(grant.Granted);
        var cells = grant.Authority!.ResourceIds.Where(id => id.StartsWith("cell:", StringComparison.Ordinal)).ToImmutableArray();
        Assert.NotEmpty(cells);

        // Move far away and exit cells that are no longer in remaining horizon.
        var exit = state.ReportVerifiedExit(robot, grant.Authority.Seq + 1, 1, cells, poseX: 20, poseY: 20, localizationOk: true);
        Assert.True(exit.Ok);
        Assert.Empty(state.Snapshot().Robots.Single(r => r.RobotId == robot).OccupiedResourceIds);
    }
}
