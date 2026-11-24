using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// Zone-chain resource model (Traffic:SemanticResourceModel = ZoneChain): a plan holds every zone its path runs
/// through, all or nothing; a standing robot holds the zone it stands in; a zone is released once the robot left it;
/// waiters are retried on a timer. Test map (x right, y up):
/// <code>
///   y 1.8 +---------- YARD ----------+---- BAY-N ----+
///         |  [SLOT-B]                |  (2..3)       |
///   y 0.6 |                          +---------------+------------+
///         |  [SLOT-A]                |     SPINE (1..3)  | BAY-E  |
///  y -0.6 +--------------------------+-------------------+--------+
///        x -1                       x 1                 x 3      x 4.2
/// </code>
/// </summary>
public class ZoneChainTrafficTests
{
    private static ImmutableArray<(double X, double Y)> Rect(double x0, double y0, double x1, double y1) =>
        ImmutableArray.Create((x0, y0), (x1, y0), (x1, y1), (x0, y1));

    private static readonly ImmutableArray<TrafficZone> Zones =
    [
        new("SLOT-A", TrafficZoneKind.Slot, Rect(-0.3, -0.3, 0.3, 0.3), [], ["EP-PARK-A"]),
        new("SLOT-B", TrafficZoneKind.Slot, Rect(-0.3, 0.9, 0.3, 1.5), [], ["EP-PARK-B"]),
        new("YARD", TrafficZoneKind.Yard, Rect(-1.0, -0.6, 1.0, 1.8), [], []),
        new("SPINE", TrafficZoneKind.Transit, Rect(1.0, -0.6, 3.0, 0.6), [], []),
        new("BAY-E", TrafficZoneKind.Bay, Rect(3.0, -0.6, 4.2, 0.6), ["EP-PARK-B"], ["EP-EAST"]),
        new("BAY-N", TrafficZoneKind.Bay, Rect(2.0, 0.6, 3.0, 1.8), ["EP-PARK-A"], ["EP-NORTH"]),
        // A queue slot inside the corridor (like MAP-ONE-V022 EP-QUEUE-B in the right column).
        new("SLOT-Q", TrafficZoneKind.Slot, Rect(1.3, -0.6, 1.7, -0.3), [], ["EP-Q"])
    ];

    private readonly FakeTimeProvider _clock = new();
    private readonly SemanticTrafficPolicy _policy = new(
        "fp-zone-chain", Guid.NewGuid(), "MAP-ZONES", CellSizeMeters: 0.10, HorizonMeters: 20.0,
        FootprintHalfLength: 0.18, FootprintHalfWidth: 0.15, [], [], PathToleranceMeters: 0.10,
        TrafficZones: Zones, ZoneChain: true);

    private readonly Guid _r1 = new("00000000-0000-0000-0000-0000000000a1");
    private readonly Guid _r2 = new("00000000-0000-0000-0000-0000000000b2");
    private readonly Guid _r3 = new("00000000-0000-0000-0000-0000000000c3");
    private readonly Guid _cmd1 = Guid.NewGuid();
    private readonly Guid _cmd2 = Guid.NewGuid();
    private readonly Guid _cmd3 = Guid.NewGuid();

    private TrafficState NewState()
    {
        var state = new TrafficState(
            new TrafficOptions
            {
                Mode = TrafficCoordinatorMode.Semantic,
                EventLogCapacity = 256,
                AuthorityTtlSec = 30,
                LocalizationMarginMeters = 0.05,
                SemanticPrefixGrant = true, // must have no effect in the zone-chain model
                SemanticResourceModel = "ZoneChain"
            },
            _clock);
        state.BeginEpoch(100);
        Assert.True(state.BindSemanticPolicy(_policy).Ok);
        state.CompleteReconciliation([]);
        return state;
    }

    private static ImmutableArray<SemanticPlanPose> Path(params (double X, double Y)[] corners)
    {
        var poses = new List<SemanticPlanPose>();
        for (var i = 1; i < corners.Length; i++)
        {
            var (x0, y0) = corners[i - 1];
            var (x1, y1) = corners[i];
            var yaw = Math.Atan2(y1 - y0, x1 - x0);
            var n = Math.Max(2, (int)Math.Ceiling(Math.Sqrt(Math.Pow(x1 - x0, 2) + Math.Pow(y1 - y0, 2)) / 0.05));
            for (var k = i == 1 ? 0 : 1; k <= n; k++)
            {
                poses.Add(new SemanticPlanPose(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, yaw));
            }
        }

        return poses.ToImmutableArray();
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

    // R1: SLOT-A → YARD → SPINE → BAY-E. R2: SLOT-B → YARD → SPINE → BAY-N.
    private static ImmutableArray<SemanticPlanPose> ToEast() => Path((0, 0), (0.8, 0), (3.6, 0));
    private static ImmutableArray<SemanticPlanPose> ToNorth() => Path((0, 1.2), (0.8, 0.9), (1.6, 0.1), (2.5, 0.3), (2.5, 1.2));

    [Fact]
    public void A_plan_holds_every_zone_it_runs_through()
    {
        var s = NewState();
        var g = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, ToEast()));

        Assert.True(g.Granted);
        Assert.Contains("zone:SLOT-A", g.Authority!.ResourceIds);
        Assert.Contains("zone:YARD", g.Authority.ResourceIds);
        Assert.Contains("zone:SPINE", g.Authority.ResourceIds);
        Assert.Contains("zone:BAY-E", g.Authority.ResourceIds);
        Assert.DoesNotContain("zone:BAY-N", g.Authority.ResourceIds);
    }

    [Fact]
    public void A_second_robot_waits_for_the_corridor_where_it_stands_with_no_prefix()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, ToEast())).Granted);

        var w = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, ToNorth()));

        Assert.True(w.Queued);
        Assert.Equal(_r1, w.BlockingOwner);
        Assert.Null(View(s, _r2).Authority); // all or nothing: it does not drive up to the corridor and stop there
        AssertNoSharedResource(s);
    }

    [Fact]
    public void A_zone_the_robot_left_is_released_and_the_waiter_goes()
    {
        var s = NewState();
        var g1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, ToEast()));
        Assert.True(s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, ToNorth())).Queued);
        s.DrainEvents();

        // R1 reached BAY-E: the cells behind it are reported; YARD, SPINE and SLOT-A go with them.
        var held = View(s, _r1).OccupiedResourceIds.Where(r => r.StartsWith("cell:", StringComparison.Ordinal)).ToImmutableArray();
        Assert.True(s.ReportVerifiedExit(_r1, g1.Authority!.Seq + 1, 100, held, 3.6, 0, true).Ok);

        var r1 = View(s, _r1).OccupiedResourceIds;
        Assert.DoesNotContain("zone:SPINE", r1);
        Assert.DoesNotContain("zone:YARD", r1);
        Assert.DoesNotContain("zone:SLOT-A", r1);
        Assert.Contains("zone:BAY-E", r1);
        Assert.NotNull(View(s, _r2).Authority); // promoted: SPINE is free again
        AssertNoSharedResource(s);
    }

    [Fact]
    public void A_standing_robot_holds_the_zone_it_stands_in_but_a_path_beside_it_is_not_blocked_by_that_zone()
    {
        var s = NewState();
        Assert.True(s.MarkOnline(_r2, 0, 1.2, true, 0).Ok);
        Assert.Contains("zone:SLOT-B", View(s, _r2).OccupiedResourceIds);

        // Through SLOT-B: waits for R2.
        var through = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Path((0, 0), (0, 1.2), (0.8, 1.2))));
        Assert.True(through.Queued);
        Assert.Equal(_r2, through.BlockingOwner);

        // Beside it (0.7 m off its centre): the yard is free, the slot is not needed.
        var beside = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 2, Path((0, 0), (0.6, 0), (0.6, 0.5))));
        Assert.True(beside.Granted);
        Assert.DoesNotContain("zone:SLOT-B", beside.Authority!.ResourceIds);
        AssertNoSharedResource(s);
    }

    [Fact]
    public void A_replan_that_cannot_be_granted_keeps_the_current_grant_instead_of_revoking_it()
    {
        var s = NewState();
        Assert.True(s.MarkOnline(_r2, 2.5, 1.2, true, Math.PI / 2).Ok); // stands in BAY-N
        var g1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, ToEast()));
        Assert.True(g1.Granted);
        s.DrainEvents();

        var replan = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 2, Path((0.8, 0), (2.5, 0.3), (2.5, 1.2))));

        Assert.False(replan.Granted);
        Assert.Equal(g1.Authority!.AuthorityId, View(s, _r1).Authority!.AuthorityId);
        Assert.DoesNotContain(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityRevoked);
    }

    [Fact]
    public void A_waiter_blocked_by_a_body_that_held_nothing_is_granted_by_the_timer_retry()
    {
        var s = NewState();
        // R3 holds the corridor; R1 comes online inside it: SEED_CONFLICT, quarantined, holds nothing.
        var g3 = s.AcquireSemanticPlan(Plan(_r3, _cmd3, 1, Path((1.2, 0), (3.6, 0))));
        Assert.True(g3.Granted);
        Assert.True(s.MarkOnline(_r1, 2.0, 0, true, 0).Ok);
        Assert.Empty(View(s, _r1).OccupiedResourceIds);

        // R3 drives on into BAY-E: the corridor is released.
        var held3 = View(s, _r3).OccupiedResourceIds.ToImmutableArray();
        Assert.True(s.ReportVerifiedExit(_r3, g3.Authority!.Seq + 1, 100, held3, 3.6, 0, true).Ok);
        Assert.DoesNotContain("zone:SPINE", View(s, _r3).OccupiedResourceIds);

        // R2 wants the corridor: R1's body (and the corridor it stands in) is in the way.
        var w2 = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, ToNorth()));
        Assert.False(w2.Granted);

        // R1 recovers and drives off to its slot: it released nothing (it held nothing), so no promotion happened...
        Assert.True(s.MarkOnline(_r1, 2.0, 0, true, 0).Ok);
        Assert.True(s.MarkOnline(_r1, 0, 0, true, 0).Ok);
        Assert.Contains("zone:SLOT-A", View(s, _r1).OccupiedResourceIds);
        Assert.Null(View(s, _r2).Authority);

        // ...until the renew timer tries every waiter again.
        Assert.Equal(1, s.RetrySemanticWaiters());
        Assert.NotNull(View(s, _r2).Authority);
        AssertNoSharedResource(s);
    }

    [Fact]
    public void A_robot_that_lost_its_localization_still_blocks_where_it_was_last_seen()
    {
        var s = NewState();
        var g3 = s.AcquireSemanticPlan(Plan(_r3, _cmd3, 1, Path((1.2, 0), (3.6, 0))));
        Assert.True(s.MarkOnline(_r1, 2.0, 0, true, 0).Ok); // SEED_CONFLICT: holds nothing
        var held3 = View(s, _r3).OccupiedResourceIds.ToImmutableArray();
        Assert.True(s.ReportVerifiedExit(_r3, g3.Authority!.Seq + 1, 100, held3, 3.6, 0, true).Ok);
        Assert.DoesNotContain("zone:SPINE", View(s, _r3).OccupiedResourceIds);
        s.ReportProgress(_r1, 1, 100, null, 2.0, 0, localizationOk: false);

        var w2 = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, ToNorth()));

        Assert.False(w2.Granted);
    }

    [Fact]
    public void A_robot_that_refused_its_grant_stays_quarantined_through_heartbeats()
    {
        var s = NewState();
        Assert.True(s.MarkOnline(_r1, 0, 0, true, 0).Ok);
        s.MarkBlocked(_r1, TrafficState.AuthorityRefusedPrefix + "EXPIRED_ON_ARRIVAL");

        Assert.True(s.MarkOnline(_r1, 0, 0, true, 0).Ok);

        Assert.Equal(TrafficRobotPhase.Quarantined, View(s, _r1).Phase);
        Assert.False(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, ToEast())).Granted);
    }

    [Fact]
    public void A_robot_that_stops_at_a_slot_inside_the_corridor_lets_the_corridor_go()
    {
        var s = NewState();
        var g1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Path((1.2, 0), (1.5, -0.45))));
        Assert.True(g1.Granted);
        Assert.Contains("zone:SPINE", g1.Authority!.ResourceIds);

        var held = View(s, _r1).OccupiedResourceIds.Where(r => r.StartsWith("cell:", StringComparison.Ordinal)).ToImmutableArray();
        Assert.True(s.ReportVerifiedExit(_r1, g1.Authority.Seq + 1, 100, held, 1.5, -0.45, true).Ok);

        var r1 = View(s, _r1).OccupiedResourceIds;
        Assert.DoesNotContain("zone:SPINE", r1);
        Assert.Contains("zone:SLOT-Q", r1);
    }

    [Fact]
    public void A_new_command_that_cannot_be_granted_does_not_get_the_old_commands_grant_back()
    {
        var s = NewState();
        Assert.True(s.MarkOnline(_r2, 2.5, 1.2, true, Math.PI / 2).Ok); // stands in BAY-N
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, ToEast())).Granted);
        s.DrainEvents();

        // Another NAVIGATE (the robot dropped its grant on NEW_COMMAND), into the taken BAY-N.
        var other = Guid.NewGuid();
        var w = s.AcquireSemanticPlan(Plan(_r1, other, 2, Path((0.8, 0), (2.5, 0.3), (2.5, 1.2))));

        Assert.False(w.Granted);
        Assert.Null(View(s, _r1).Authority);
        Assert.Contains(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityRevoked);
    }
}
