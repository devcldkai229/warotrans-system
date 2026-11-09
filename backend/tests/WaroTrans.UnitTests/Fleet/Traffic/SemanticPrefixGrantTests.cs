using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// Traffic:SemanticPrefixGrant: a robot in conflict drives up to the conflict and waits there. Without it (the scenario
/// tests) a plan is granted whole or not at all, so the robot stops wherever it is, possibly metres before the zone.
/// </summary>
public class SemanticPrefixGrantTests
{
    private const string Zone = "zone:ZONE-SHELF";

    private static readonly SemanticZonePoly ShelfZone = new(
        "ZONE-SHELF", ImmutableArray.Create((6.0, -0.5), (7.0, -0.5), (7.0, 0.5), (6.0, 0.5)));

    private static readonly SemanticZonePoly NoStop = new(
        "ZONE-NO-STOP", ImmutableArray.Create((3.0, 9.5), (4.0, 9.5), (4.0, 10.5), (3.0, 10.5)));

    private readonly FakeTimeProvider _clock = new();
    private readonly SemanticTrafficPolicy _policy = new(
        "fp-prefix", Guid.NewGuid(), "MAP-TEST", CellSizeMeters: 0.25, HorizonMeters: 4.0,
        FootprintHalfLength: 0.18, FootprintHalfWidth: 0.15, [ShelfZone], [NoStop], PathToleranceMeters: 0.15);

    private readonly Guid _leader = new("00000000-0000-0000-0000-0000000000a1");
    private readonly Guid _follower = new("00000000-0000-0000-0000-0000000000b2");
    private readonly Guid _cmd1 = Guid.NewGuid();
    private readonly Guid _cmd2 = Guid.NewGuid();

    private TrafficState NewState()
    {
        var state = new TrafficState(
            new TrafficOptions
            {
                Mode = TrafficCoordinatorMode.Semantic,
                EventLogCapacity = 256,
                AuthorityTtlSec = 30,
                LocalizationMarginMeters = 0.05,
                SemanticPrefixGrant = true
            },
            _clock);
        state.BeginEpoch(100);
        Assert.True(state.BindSemanticPolicy(_policy).Ok);
        state.CompleteReconciliation([]);
        return state;
    }

    private static ImmutableArray<SemanticPlanPose> Line(double x0, double y0, double x1, double y1)
    {
        const int n = 40;
        var yaw = Math.Atan2(y1 - y0, x1 - x0);
        return Enumerable.Range(0, n + 1)
            .Select(i => new SemanticPlanPose(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, yaw))
            .ToImmutableArray();
    }

    private SemanticPlanProposeRequest Plan(Guid robot, Guid command, long revision, ImmutableArray<SemanticPlanPose> poses) =>
        new(Guid.NewGuid(), robot, robot.ToString("N")[..6], _policy.SemanticMapFingerprint, revision, poses,
            null, null, null, PlanHash: $"h{revision}", CommandId: command);

    private static RobotTrafficView View(TrafficState s, Guid robot) => s.Snapshot().Robots.Single(r => r.RobotId == robot);

    private static void AssertNoSharedResource(TrafficState s)
    {
        foreach (var res in s.Snapshot().Resources)
        {
            Assert.True(res.Holders.Length <= res.Capacity, $"{res.ResourceId} held by {res.Holders.Length}");
        }
    }

    /// <summary>The leader sits in the zone, going away from the follower's approach.</summary>
    private TrafficState LeaderInTheZone(out AcquireResult leader)
    {
        var s = NewState();
        leader = s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(6.5, 0, 6.5, -3)));
        Assert.True(leader.Granted);
        Assert.Contains(Zone, leader.Authority!.ResourceIds);
        s.DrainEvents();
        return s;
    }

    [Fact]
    public void Follower_drives_up_to_the_zone_and_waits_before_it()
    {
        var s = LeaderInTheZone(out _);
        var result = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(3.5, 0, 7.5, 0)));

        Assert.True(result.Granted);
        Assert.DoesNotContain(Zone, result.Authority!.ResourceIds);
        // It can move: the reservation reaches well past where it stands.
        var clearOfStart = result.Authority.ResourceIds.Where(rid =>
            SemanticReservation.IsPhysicallyClearOfResources(_policy, 3.5, 0, [rid], _policy.ReserveRadiusMeters)).ToList();
        Assert.NotEmpty(clearOfStart);
        // Nowhere inside what it holds does its body reach the zone.
        for (var x = 3.5; x < 6.0; x += 0.05)
        {
            var body = new HashSet<string>(StringComparer.Ordinal);
            SemanticReservation.DiscCells(x, 0, _policy.FootprintRadiusMeters + 0.05, _policy.EffectiveCellSize, body);
            if (body.All(result.Authority.ResourceIds.Contains))
            {
                Assert.False(SemanticReservation.DiscHitsZone(x, 0, _policy.FootprintRadiusMeters, ShelfZone.Ring), $"x={x}");
            }
        }

        Assert.Equal(TrafficRobotPhase.Authorized, View(s, _follower).Phase);
        Assert.Equal(_leader, View(s, _follower).BlockingOwner);
        Assert.Contains(s.Snapshot().Waits, w => w.RobotId == _follower && w.ResourceId == Zone);
        Assert.Contains(s.ActiveAuthorityKeys(), k => k.RobotId == _follower); // renewed while it waits
        AssertNoSharedResource(s);
    }

    [Fact]
    public void When_the_zone_is_free_the_follower_gets_the_rest_of_its_plan()
    {
        var s = LeaderInTheZone(out var leader);
        var partial = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(3.5, 0, 7.5, 0)));
        s.DrainEvents();

        var left = View(s, _leader).OccupiedResourceIds
            .Where(rid => SemanticReservation.IsPhysicallyClearOfResources(_policy, 6.5, -3, [rid], 0.05))
            .ToImmutableArray();
        Assert.Contains(Zone, left);
        Assert.True(s.ReportVerifiedExit(_leader, leader.Authority!.Seq + 1, 100, left, 6.5, -3, true).Ok);

        var granted = s.DrainEvents().Last(e => e.Kind == TrafficEventKind.AuthorityGranted && e.RobotId == _follower);
        Assert.NotEqual(partial.Authority!.AuthorityId, granted.Authority.AuthorityId);
        Assert.Contains(Zone, granted.Authority.ResourceIds);
        Assert.Equal(1, granted.Authority.PlanRevision);
        Assert.Equal(TrafficRobotPhase.Authorized, View(s, _follower).Phase);
        Assert.Null(View(s, _follower).BlockingOwner);
        Assert.DoesNotContain(s.Snapshot().Waits, w => w.RobotId == _follower);
        AssertNoSharedResource(s);
    }

    [Fact]
    public void Head_on_robot_does_not_advance_into_the_path_of_the_other()
    {
        var s = NewState();
        var a = s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(0, -4, 6, -4)));
        Assert.True(a.Granted);

        // Coming the other way down the same corridor: any step forward is space the leader still needs.
        var b = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(6, -4, 0, -4)));
        Assert.False(b.Granted);
        Assert.True(b.Queued);
        Assert.Null(View(s, _follower).Authority);
    }

    [Fact]
    public void Crossing_robot_waits_before_the_path_of_the_other_not_on_it()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(0, 8, 8, 8))).Granted);

        var result = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(2, 12, 2, 4)));
        Assert.True(result.Granted);
        var leaderNeeds = SemanticReservation.WholePathResources(_policy, Line(0, 8, 8, 8));
        Assert.Empty(result.Authority!.ResourceIds.Intersect(leaderNeeds));
        AssertNoSharedResource(s);
    }

    [Fact]
    public void Never_told_to_wait_inside_a_no_stop_zone()
    {
        var s = NewState();
        // The leader holds what comes right after the no-stop zone: the first conflict falls inside the zone.
        Assert.True(s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(4.6, 10, 8, 10))).Granted);

        var result = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(0.5, 10, 8, 10)));
        Assert.True(result.Granted);
        var noStopCells = new HashSet<string>(StringComparer.Ordinal);
        for (var x = 3.25; x <= 3.75; x += 0.05)
        {
            SemanticReservation.DiscCells(x, 10, 0.05, _policy.EffectiveCellSize, noStopCells);
        }

        Assert.Empty(result.Authority!.ResourceIds.Intersect(noStopCells));
    }

    [Fact]
    public void A_grant_too_short_to_be_useful_is_not_given()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(1.0, 0, 1.0, -3))).Granted);
        var result = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(0.8, 0, 3, 0)));
        Assert.True(result.Queued);
        Assert.Null(View(s, _follower).Authority);
    }

    [Fact]
    public void Re_proposing_the_held_part_sends_it_again_after_a_lost_extend()
    {
        var s = LeaderInTheZone(out _);
        var plan = Plan(_follower, _cmd2, 1, Line(3.5, 0, 7.5, 0));
        var first = s.AcquireSemanticPlan(plan);
        s.DrainEvents();

        var again = s.AcquireSemanticPlan(plan);
        Assert.Equal(first.Authority!.AuthorityId, again.Authority!.AuthorityId);
        Assert.Contains(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityExtended && e.RobotId == _follower);
    }

    [Fact]
    public void Off_by_default()
    {
        Assert.False(new TrafficOptions().SemanticPrefixGrant);
        Assert.Equal(0, new TrafficOptions().SemanticLaneHalfWidthMeters);
    }

    // ------------------------------------------------------------------ two lanes side by side (MAP-ONE-V004: 0.67 m apart)

    private TrafficState LaneState()
    {
        var options = new TrafficOptions
        {
            Mode = TrafficCoordinatorMode.Semantic,
            EventLogCapacity = 256,
            AuthorityTtlSec = 30,
            LocalizationMarginMeters = 0.05,
            SemanticPrefixGrant = true,
            SemanticCellSizeMeters = 0.1,
            SemanticHorizonMeters = 4.0,
            SemanticPathToleranceMeters = 0.15,
            SemanticLaneHalfWidthMeters = 0.26
        };
        var state = new TrafficState(options, _clock);
        state.BeginEpoch(100);
        Assert.True(state.BindSemanticPolicy(options.ApplySemanticOverrides(_policy with { SingleOccupancyZones = [], NoStopZones = [] })).Ok);
        state.CompleteReconciliation([]);
        return state;
    }

    [Fact]
    public void Opposite_lanes_are_granted_side_by_side()
    {
        var s = LaneState();
        var north = s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(1.19, 0.1, 1.19, 4.1)));
        var south = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(0.52, 4.1, 0.52, 0.1)));
        Assert.True(north.Granted);
        Assert.True(south.Granted);
        Assert.Empty(north.Authority!.ResourceIds.Intersect(south.Authority!.ResourceIds));
        Assert.Null(View(s, _follower).BlockingOwner);
        AssertNoSharedResource(s);
    }

    [Fact]
    public void Same_lane_head_on_still_conflicts_with_lane_rectangles()
    {
        var s = LaneState();
        Assert.True(s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(1.19, 0.1, 1.19, 4.1))).Granted);
        var other = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(1.19, 3.0, 1.19, 0.1)));
        Assert.False(other.Granted);
        AssertNoSharedResource(s);
    }

    [Fact]
    public void A_path_across_the_lane_still_conflicts_with_lane_rectangles()
    {
        var s = LaneState();
        Assert.True(s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(1.19, 0.1, 1.19, 4.1))).Granted);
        var across = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(0.2, 2.0, 2.2, 2.0)));
        if (across.Granted)
        {
            // Only the part before the lane.
            Assert.Empty(across.Authority!.ResourceIds.Intersect(View(s, _leader).OccupiedResourceIds));
        }

        AssertNoSharedResource(s);
    }

    [Fact]
    public void Following_on_a_lane_keeps_the_follower_behind_the_leader()
    {
        var s = LaneState();
        Assert.True(s.AcquireSemanticPlan(Plan(_leader, _cmd1, 1, Line(1.19, 2.0, 1.19, 6.0))).Granted);
        var follower = s.AcquireSemanticPlan(Plan(_follower, _cmd2, 1, Line(1.19, 0.0, 1.19, 4.0)));
        Assert.True(follower.Granted);
        Assert.Empty(follower.Authority!.ResourceIds.Intersect(View(s, _leader).OccupiedResourceIds));
        // It keeps a body length from the leader's rear.
        var ys = follower.Authority.ResourceIds.Select(r => int.Parse(r.Split(':')[2], System.Globalization.CultureInfo.InvariantCulture)).Max();
        Assert.True(ys * 0.1 < 2.0 - 0.18, $"reaches y={ys * 0.1}");
        AssertNoSharedResource(s);
    }

    [Fact]
    public void A_turn_on_the_spot_reserves_the_full_disc_even_with_lane_rectangles()
    {
        var policy = new TrafficOptions
        {
            SemanticCellSizeMeters = 0.1,
            SemanticHorizonMeters = 4.0,
            SemanticPathToleranceMeters = 0.15,
            SemanticLaneHalfWidthMeters = 0.26
        }.ApplySemanticOverrides(_policy);
        var turning = ImmutableArray.Create(new SemanticPlanPose(0, 0, 1.57), new SemanticPlanPose(3, 0, 0));
        var facing = ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(3, 0, 0));
        var body = new HashSet<string>(StringComparer.Ordinal);
        SemanticReservation.DiscCells(0, 0, policy.FootprintRadiusMeters, policy.EffectiveCellSize, body);
        Assert.Subset(SemanticReservation.CollectResources(policy, turning).ToHashSet(), body);
        Assert.True(SemanticReservation.CollectResources(policy, facing).Length
                    < SemanticReservation.CollectResources(policy, turning).Length);
    }
}
