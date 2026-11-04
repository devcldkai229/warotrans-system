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
    public void CollectResources_horizon_limits_cells()
    {
        var policy = Policy() with { HorizonMeters = 1.0, CellSizeMeters = 0.5 };
        var poses = ImmutableArray.Create(
            new SemanticPlanPose(0, 0, 0),
            new SemanticPlanPose(0.4, 0, 0),
            new SemanticPlanPose(10, 0, 0)); // beyond horizon
        var ids = SemanticReservation.CollectResources(policy, poses);
        // Far cell at x=10 should not appear when horizon is 1 m.
        Assert.DoesNotContain(ids, id => id.Contains(":20:") || id.EndsWith(":20", StringComparison.Ordinal));
    }

    [Fact]
    public void AcquireSemanticPlan_exclusive_zone_second_robot_queues()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        var zone = new SemanticZonePoly(
            "Z1",
            ImmutableArray.Create((0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)));
        var policy = Policy(zone);
        Assert.True(state.BindSemanticPolicy(policy).Ok);

        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();
        var poses = ImmutableArray.Create(new SemanticPlanPose(1, 1, 0), new SemanticPlanPose(1.2, 1, 0));
        var g1 = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), r1, "RBT-1", policy.SemanticMapFingerprint, 1, poses, null, null, null));
        Assert.True(g1.Granted);
        Assert.Contains("zone:Z1", g1.Authority!.ResourceIds);

        var g2 = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), r2, "RBT-2", policy.SemanticMapFingerprint, 1, poses, null, null, null));
        Assert.False(g2.Granted);
        Assert.True(g2.Queued);
    }

    [Fact]
    public void AcquireSemanticPlan_fingerprint_mismatch_rejects()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        var policy = Policy();
        Assert.True(state.BindSemanticPolicy(policy).Ok);
        var bad = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), Guid.NewGuid(), "R", "wrong-fp", 1,
            ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0)),
            null, null, null));
        Assert.False(bad.Granted);
        Assert.Equal("FINGERPRINT_MISMATCH", bad.Reason);
    }

    [Fact]
    public void Physical_clearance_releases_cell()
    {
        var policy = Policy();
        var cells = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.SampleFootprintCells(0, 0, 0, 0.18, 0.15, 0.5, cells);
        Assert.NotEmpty(cells);
        var farClear = SemanticReservation.IsPhysicallyClearOfResources(
            policy, 10, 10, 0, cells, margin: 0.05);
        Assert.True(farClear);
        var stillInside = SemanticReservation.IsPhysicallyClearOfResources(
            policy, 0, 0, 0, cells, margin: 0.05);
        Assert.False(stillInside);
    }

    [Fact]
    public void MarkOnline_clears_OFFLINE_but_traffic_plan_does_not()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        var policy = Policy();
        Assert.True(state.BindSemanticPolicy(policy).Ok);

        var robot = Guid.NewGuid();
        Assert.True(state.MarkOffline(robot).Ok);
        Assert.Equal(TrafficRobotPhase.Quarantined, state.Snapshot().Robots.Single(r => r.RobotId == robot).Phase);

        var poses = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0));
        var rejected = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), robot, "RBT-1", policy.SemanticMapFingerprint, 1, poses, null, null, null));
        Assert.Equal("QUARANTINED", rejected.Reason);

        Assert.True(state.MarkOnline(robot).Ok);
        var recovered = state.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Idle, recovered.Phase);
        Assert.Null(recovered.QuarantineReason);

        var granted = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), robot, "RBT-1", policy.SemanticMapFingerprint, 2, poses, null, null, null));
        Assert.True(granted.Granted);
    }

    [Fact]
    public void AcquireSemanticPlan_does_not_clear_LOCALIZATION_LOSS_quarantine()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        var policy = Policy();
        Assert.True(state.BindSemanticPolicy(policy).Ok);

        var robot = Guid.NewGuid();
        var poses = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(1, 0, 0));
        var grant = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), robot, "RBT-1", policy.SemanticMapFingerprint, 1, poses, null, null, null));
        Assert.True(grant.Granted);

        // Pose-less progress with localizationOk=false quarantines.
        Assert.True(state.ReportProgress(robot, grant.Authority!.Seq + 1, 1, null, 0.1, 0, localizationOk: false).Ok);
        var lost = state.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, lost.Phase);
        Assert.Equal("LOCALIZATION_LOSS", lost.QuarantineReason);

        // Fresh traffic_plan alone must NOT clear quarantine.
        var again = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), robot, "RBT-1", policy.SemanticMapFingerprint, 2, poses, null, null, null));
        Assert.False(again.Granted);
        Assert.Equal("QUARANTINED", again.Reason);
        var still = state.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, still.Phase);
        Assert.Equal("LOCALIZATION_LOSS", still.QuarantineReason);
    }

    [Fact]
    public void AcquireSemanticPlan_replan_diff_releases_far_cells_and_promotes_waiter()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        var policy = Policy() with { HorizonMeters = 1.0, CellSizeMeters = 0.5 };
        Assert.True(state.BindSemanticPolicy(policy).Ok);

        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();
        // First grant covers cells near origin.
        var pathA = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(0.8, 0, 0));
        var g1 = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), r1, "RBT-1", policy.SemanticMapFingerprint, 1, pathA, null, null, null));
        Assert.True(g1.Granted);

        // Seed pose so diff-release can prove clearance of abandoned cells.
        Assert.True(state.ReportProgress(r1, g1.Authority!.Seq + 1, 1, null, 5.0, 0, localizationOk: true).Ok);

        // Second robot wants overlapping first horizon → queues.
        var g2q = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), r2, "RBT-2", policy.SemanticMapFingerprint, 1, pathA, null, null, null));
        Assert.True(g2q.Queued);

        // R1 replans far away; old cells near origin should diff-release and promote R2.
        var pathB = ImmutableArray.Create(new SemanticPlanPose(5.0, 0, 0), new SemanticPlanPose(5.5, 0, 0));
        var g1b = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), r1, "RBT-1", policy.SemanticMapFingerprint, 2, pathB, null, null, null));
        Assert.True(g1b.Granted);

        var g2 = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), r2, "RBT-2", policy.SemanticMapFingerprint, 2, pathA, null, null, null));
        Assert.True(g2.Granted);
    }

    [Fact]
    public void ReportVerifiedExit_works_without_graph_when_semantic_bound()
    {
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        var policy = Policy();
        Assert.True(state.BindSemanticPolicy(policy).Ok);

        var robot = Guid.NewGuid();
        var poses = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(0.5, 0, 0));
        var grant = state.AcquireSemanticPlan(new SemanticPlanProposeRequest(
            Guid.NewGuid(), robot, "RBT-1", policy.SemanticMapFingerprint, 1, poses, null, null, null));
        Assert.True(grant.Granted);
        var cells = grant.Authority!.ResourceIds.Where(id => id.StartsWith("cell:", StringComparison.Ordinal)).ToImmutableArray();
        Assert.NotEmpty(cells);

        // Move far away and exit cells that are no longer in remaining horizon.
        var exit = state.ReportVerifiedExit(
            robot,
            grant.Authority.Seq + 1,
            1,
            cells,
            poseX: 20,
            poseY: 20,
            localizationOk: true);
        Assert.True(exit.Ok);
        Assert.Empty(state.Snapshot().Robots.Single(r => r.RobotId == robot).OccupiedResourceIds);
    }
}
