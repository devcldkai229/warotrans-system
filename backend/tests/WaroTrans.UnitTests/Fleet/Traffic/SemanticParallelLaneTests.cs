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
    public void A_robot_parked_with_a_known_heading_does_not_block_the_turn_out_of_the_next_bay()
    {
        // MAP-ONE-V015: EP-PARKING-A (-0.561, -1.620) and EP-PARKING-B (0.157, -1.623), both facing +y, 0.72 m apart.
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, -0.561, -1.620, localizationOk: true, poseYaw: Math.PI / 2).Ok);
        Assert.True(s.EnsureTracked(_r2, 0.157, -1.623, localizationOk: true, poseYaw: Math.PI / 2).Ok);
        // R2 turns on the spot towards the centre and drives off: the start keeps the full circle.
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r2, Line(0.157, -1.623, 0.9, -0.95))).Granted);
    }

    [Fact]
    public void Without_a_heading_a_parked_robot_keeps_the_any_heading_circle_and_the_neighbour_still_leaves()
    {
        // The parked one holds the circle (any heading), but the plan's start reserves only the body + the gate's stop
        // margin (path tolerance grows with the distance driven): 0.72 m apart leaves 0.25 m between the bodies, so the
        // neighbour may leave. With the full 0.15 m at the start neither could (lab 2026-11-23, MAP-ONE-V019, 0.66 m).
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, -0.561, -1.620, localizationOk: true).Ok);
        Assert.True(s.EnsureTracked(_r2, 0.157, -1.623, localizationOk: true).Ok);
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r2, Line(0.157, -1.623, 0.9, -0.95))).Granted);
    }

    [Fact]
    public void Two_robots_parked_066_m_apart_can_each_leave_v019()
    {
        // MAP-ONE-V019 lab 2026-11-23: RBT-001 at (-0.562, -1.570), RBT-002 at (0.096, -1.539), both facing about +y.
        // RBT-002's real Nav2 plan out of PARKING-B: a step north, then north-east to the lane (R231126009).
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, -0.562, -1.570, localizationOk: true, poseYaw: 1.70).Ok);
        Assert.True(s.EnsureTracked(_r2, 0.096, -1.539, localizationOk: true, poseYaw: 1.70).Ok);
        ImmutableArray<SemanticPlanPose> outOfB =
        [
            new(0.096, -1.539, 1.704), new(0.083, -1.441, 0.785), new(0.146, -1.378, 0.785), new(0.208, -1.316, 0.785),
            new(0.271, -1.253, 0.785), new(0.333, -1.191, 0), new(0.533, -1.191, 0), new(0.733, -1.191, 0), new(1.03, -1.191, 0)
        ];
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r2, outOfB)).Granted);
    }

    [Fact]
    public void A_robot_parked_066_m_away_may_step_aside()
    {
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, -0.562, -1.570, localizationOk: true, poseYaw: 1.70).Ok);
        Assert.True(s.EnsureTracked(_r2, 0.096, -1.539, localizationOk: true, poseYaw: 1.70).Ok);
        Assert.True(s.AcquireSemanticPlan(Plan(policy, _r1, Line(-0.562, -1.570, -0.862, -1.570))).Granted);
    }

    [Fact]
    public void The_path_tolerance_grows_from_the_start()
    {
        var policy = Policy(laneHalfWidth: 0.25);
        Assert.Equal(SemanticReservation.StartToleranceMeters, SemanticReservation.ToleranceAt(policy, 0), 6);
        Assert.Equal(0.10, SemanticReservation.ToleranceAt(policy, 0.1), 6);
        Assert.Equal(policy.PathToleranceMeters, SemanticReservation.ToleranceAt(policy, 1.0), 6);
        // Never closer than the robot gate checks: body (any heading) + stop margin at the start (discs, no lanes).
        var discs = Policy(laneHalfWidth: 0);
        var start = SemanticReservation.CollectResources(discs, Line(0.05, 0.05, 1.0, 0.05));
        var gate = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.DiscCells(0.05, 0.05, discs.FootprintRadiusMeters + 0.05, discs.EffectiveCellSize, gate);
        Assert.True(gate.IsSubsetOf(start));
    }

    [Fact]
    public void Standing_cells_follow_the_body_rectangle_at_its_heading()
    {
        var policy = Policy(laneHalfWidth: 0.25);
        var upright = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.StandingCells(policy, 0.05, 0.05, Math.PI / 2, 0.05, upright);
        // Body 0.36 long (y) x 0.31 wide (x) + 0.05 each side: x in [-0.155, 0.255], y in [-0.18, 0.28].
        Assert.Contains(SemanticReservation.CellId(-2, 0), upright);
        Assert.DoesNotContain(SemanticReservation.CellId(-3, 0), upright);
        Assert.Contains(SemanticReservation.CellId(0, 2), upright);
        Assert.DoesNotContain(SemanticReservation.CellId(0, 3), upright);
        var circle = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.StandingCells(policy, 0.05, 0.05, null, 0.05, circle);
        Assert.True(upright.IsProperSubsetOf(circle));
    }

    [Fact]
    public void A_cancelled_route_leaves_no_wait_behind()
    {
        // MAP-ONE-V016 sim, 2026-11-23: R2's NAVIGATE (waiting for R1's cells) was cancelled; its queue entries stayed,
        // so R1, asking for R2's cells, was refused DEADLOCK_RISK forever although R2 stood still.
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, 0.0, 0.0, localizationOk: true, poseYaw: 0).Ok);
        Assert.True(s.EnsureTracked(_r2, 1.5, 0.0, localizationOk: true, poseYaw: Math.PI).Ok);
        var cmd = Guid.NewGuid();
        var r2Plan = Plan(policy, _r2, Line(1.5, 0.0, -1.0, 0.0)) with { CommandId = cmd };
        Assert.False(s.AcquireSemanticPlan(r2Plan).Granted); // waits for R1's cells

        Assert.True(s.CompleteRoute(_r2, succeeded: true, "CANCELED", commandId: cmd, poseX: 1.5, poseY: 0.0).Ok);

        var r1Plan = Plan(policy, _r1, Line(0.0, 0.0, 0.0, 1.5));
        var granted = s.AcquireSemanticPlan(r1Plan);
        Assert.True(granted.Granted, granted.Reason);
    }

    [Fact]
    public void An_idle_robot_that_once_waited_is_not_part_of_a_wait_for_cycle()
    {
        // V017 sim, 2026-11-23: R2's cancelled NAVIGATE left BlockingOwner = R1; R1, waiting for R2's cells, was refused
        // DEADLOCK_RISK (a cycle through an idle robot) and backed off on the spot for ever instead of plain waiting.
        var policy = Policy(laneHalfWidth: 0.25);
        var s = NewState(policy);
        Assert.True(s.EnsureTracked(_r1, 0.0, 0.0, localizationOk: true, poseYaw: 0).Ok);
        Assert.True(s.EnsureTracked(_r2, 1.5, 0.0, localizationOk: true, poseYaw: Math.PI).Ok);
        var cmd = Guid.NewGuid();
        Assert.False(s.AcquireSemanticPlan(Plan(policy, _r2, Line(1.5, 0.0, -1.0, 0.0)) with { CommandId = cmd }).Granted);
        Assert.True(s.CompleteRoute(_r2, succeeded: true, "CANCELED", commandId: cmd, poseX: 1.5, poseY: 0.0).Ok);

        var r1 = s.AcquireSemanticPlan(Plan(policy, _r1, Line(0.0, 0.0, 3.0, 0.0))); // straight through R2
        Assert.False(r1.Granted);
        Assert.DoesNotContain("DEADLOCK", r1.Reason ?? "");
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
