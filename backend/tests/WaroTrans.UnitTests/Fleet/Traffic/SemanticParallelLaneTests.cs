using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// Real two-robot runs on MAP-ONE-V013 (2026-11-22): the robots took turns on the two opposite one-way lanes
/// (x = 0.205 down, x = 0.878 up), a robot docked at EP-SHELF-C-1 blocked the lane above it, and a robot waiting at a
/// wait point was reported as the blocker of cells nobody held.
/// </summary>
public class SemanticParallelLaneTests
{
    private readonly Guid _r1 = new("00000000-0000-0000-0000-0000000000a1");
    private readonly Guid _r2 = new("00000000-0000-0000-0000-0000000000b2");
    private readonly Guid _r3 = new("00000000-0000-0000-0000-0000000000c3");

    private static SemanticTrafficPolicy Policy(double laneHalfWidth) => new(
        "fp-lane", Guid.NewGuid(), "MAP-TEST", CellSizeMeters: 0.10, HorizonMeters: 2.0,
        FootprintHalfLength: 0.18, FootprintHalfWidth: 0.155, [], [], PathToleranceMeters: 0.15,
        LaneHalfWidthMeters: laneHalfWidth, ZoneMarginMeters: 0.05);

    private static TrafficState NewState(SemanticTrafficPolicy policy)
    {
        var state = new TrafficState(new TrafficOptions
        {
            Mode = TrafficCoordinatorMode.Semantic,
            EventLogCapacity = 256,
            AuthorityTtlSec = 30,
            LocalizationMarginMeters = 0.05,
            SemanticPrefixGrant = false
        });
        state.BeginEpoch(1);
        Assert.True(state.BindSemanticPolicy(policy).Ok);
        state.CompleteReconciliation([]);
        return state;
    }

    private static ImmutableArray<SemanticPlanPose> Line(double x0, double y0, double x1, double y1)
    {
        var n = (int)Math.Ceiling(Math.Sqrt(Math.Pow(x1 - x0, 2) + Math.Pow(y1 - y0, 2)) / 0.05);
        var yaw = Math.Atan2(y1 - y0, x1 - x0);
        return Enumerable.Range(0, n + 1)
            .Select(i => new SemanticPlanPose(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, yaw))
            .ToImmutableArray();
    }

    private static SemanticPlanProposeRequest Plan(SemanticTrafficPolicy policy, Guid robot, ImmutableArray<SemanticPlanPose> poses) =>
        new(Guid.NewGuid(), robot, robot.ToString("N")[..6], policy.SemanticMapFingerprint, 1, poses,
            null, null, null, PlanHash: "h1", CommandId: Guid.NewGuid());

    [Fact]
    public void Two_robots_on_opposite_one_way_lanes_drive_at_the_same_time()
    {
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r1, Line(0.205, 1.5, 0.205, -3.0))).Granted);
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r2, Line(0.878, -1.5, 0.878, 3.0))).Granted);
    }

    [Fact]
    public void Without_lane_bands_the_same_two_lanes_share_cells()
    {
        var policy = Policy(laneHalfWidth: 0);
        var s = NewState(policy);
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r1, Line(0.205, 1.5, 0.205, -3.0))).Granted);
        Assert.False(s.AcquireSemanticPlan(Plan(policy, _r2, Line(0.878, -1.5, 0.878, 3.0))).Granted);
    }

    [Fact]
    public void A_robot_docked_at_shelf_c_does_not_block_the_lane_above_it()
    {
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, 1.048, -1.552, localizationOk: true).Ok); // EP-SHELF-C-1
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r2, Line(-0.6, -0.808, 3.0, -0.808))).Granted); // lane y = -0.808
    }

    [Fact]
    public void The_goal_keeps_the_full_disc_for_spins_in_the_bay()
    {
        var policy = Policy(laneHalfWidth: 0.25);
        var resources = SemanticReservation.CollectResources(policy, Line(0.0, 0.0, 1.2, 0.0));
        // 0.35 m to the side: outside the 0.25 m lane band, inside the 0.40 m disc.
        Assert.DoesNotContain(SemanticReservation.CellId(0, 3), resources); // start (0, 0), already facing the way
        Assert.Contains(SemanticReservation.CellId(11, 3), resources);  // goal (1.2, 0)
        Assert.DoesNotContain(SemanticReservation.CellId(3, 3), resources); // mid lane (0.35, 0)
    }

    [Fact]
    public void A_waiting_robot_does_not_block_cells_it_does_not_hold()
    {
        var policy = Policy(laneHalfWidth: 0);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, 0.8, 0.0, localizationOk: true).Ok);
        // R2 waits for R1: queued on every cell of its 2 m horizon.
        Assert.True(s.EnsureTracked(_r2, -1.5, 0.0, localizationOk: true).Ok);
        Assert.False(s.AcquireSemanticPlan(Plan(policy, _r2, Line(-1.5, 0.0, 3.0, 0.0))).Granted);

        // R3 crosses R2's horizon where nobody holds anything: granted, R2 is not its blocker.
        Assert.True(s.EnsureTracked(_r3, -0.5, -1.5, localizationOk: true).Ok);
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r3, Line(-0.5, -1.5, -0.5, -0.05))).Granted);
    }
}
