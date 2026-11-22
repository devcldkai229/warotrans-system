using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// Real two-robot run on MAP-ONE-V013 (2026-11-22): RBT-001 was seeded at the provisional AMCL pose (0, 0) during
/// LOCALIZE and kept that seed after its pose jumped to EP-PARKING-A; RBT-002 at EP-PARKING-B then could not seed
/// (SEED_CONFLICT), held nothing, and RBT-001 was granted a path straight through it (body gap 5 cm, safety stop).
/// </summary>
public class SemanticBodyPresenceTests
{
    private static readonly SemanticZonePoly CenterZone = new(
        "ZONE-SINGLE-CENTER", ImmutableArray.Create((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)));

    private readonly SemanticTrafficPolicy _policy = new(
        "fp-body", Guid.NewGuid(), "MAP-TEST", CellSizeMeters: 0.10, HorizonMeters: 4.0,
        FootprintHalfLength: 0.18, FootprintHalfWidth: 0.155, [CenterZone], [], PathToleranceMeters: 0.15);

    private readonly Guid _r1 = new("00000000-0000-0000-0000-0000000000a1");
    private readonly Guid _r2 = new("00000000-0000-0000-0000-0000000000b2");

    private TrafficState NewState()
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

    private SemanticPlanProposeRequest Plan(Guid robot, ImmutableArray<SemanticPlanPose> poses) =>
        new(Guid.NewGuid(), robot, robot.ToString("N")[..6], _policy.SemanticMapFingerprint, 1, poses,
            null, null, null, PlanHash: "h1", CommandId: Guid.NewGuid());

    private static RobotTrafficView View(TrafficState s, Guid robot) => s.Snapshot().Robots.Single(r => r.RobotId == robot);

    [Fact]
    public void A_robot_that_holds_nothing_still_blocks_a_path_through_its_body()
    {
        var s = NewState();
        // R1 parked at (-0.8, -0.8); R2 at (0.0, -0.8) could not seed: R1 still holds what R2 stands on.
        Assert.True(s.EnsureTracked(_r1, -0.8, -0.8, localizationOk: true).Ok);
        Assert.True(s.HoldServiceResource(_r1, "cell:-1:-8").Ok);
        var r2 = s.EnsureTracked(_r2, 0.0, -0.8, localizationOk: true);
        Assert.False(r2.Ok);
        Assert.StartsWith("SEED_CONFLICT", r2.Reason);
        Assert.Empty(View(s, _r2).OccupiedResourceIds);

        // R1 asks for a path east through where R2 stands: refused (it used to be granted).
        var through = s.AcquireSemanticPlan(Plan(_r1, Line(-0.8, -0.8, 1.0, -0.8)));
        Assert.False(through.Granted);
        Assert.Equal(_r2, View(s, _r1).BlockingOwner);
    }

    [Fact]
    public void Robots_that_already_stand_too_close_can_still_drive_apart()
    {
        var s = NewState();
        Assert.True(s.EnsureTracked(_r1, -0.8, -0.8, localizationOk: true).Ok);
        Assert.True(s.HoldServiceResource(_r1, "cell:-1:-8").Ok);
        Assert.False(s.EnsureTracked(_r2, 0.0, -0.8, localizationOk: true).Ok);

        // West, away from R2: its own body cells (shared with R2's) do not block it.
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, Line(-0.8, -0.8, -2.0, -0.8))).Granted);
    }

    [Fact]
    public void An_idle_robot_seeded_at_a_stale_pose_follows_its_fresh_pose()
    {
        var s = NewState();
        // Seeded at the provisional (0, 0): inside ZONE-SINGLE-CENTER.
        Assert.True(s.EnsureTracked(_r1, 0.0, 0.0, localizationOk: true).Ok);
        Assert.Contains("zone:ZONE-SINGLE-CENTER", View(s, _r1).OccupiedResourceIds);

        // Next heartbeat: localized at its parking spot, well clear of the zone.
        Assert.True(s.MarkOnline(_r1, -1.5, -1.5, localizationOk: true).Ok);

        var held = View(s, _r1).OccupiedResourceIds;
        Assert.DoesNotContain("zone:ZONE-SINGLE-CENTER", held);
        Assert.DoesNotContain("cell:0:0", held);
        Assert.Contains("cell:-15:-15", held);

        // A second robot can now seed next to the zone.
        Assert.True(s.EnsureTracked(_r2, 0.0, -0.6, localizationOk: true).Ok);
    }

    [Fact]
    public void A_robot_parked_next_to_a_zone_does_not_take_it_with_its_plan()
    {
        // EP-PARKING-B on MAP-ONE-V013: 0.245 m below ZONE-SINGLE-CENTER. Moving away from it, the plan must not hold the zone.
        var policy = _policy with { ZoneMarginMeters = 0.05 };
        var s = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64, SemanticPrefixGrant = false });
        s.BeginEpoch(1);
        Assert.True(s.BindSemanticPolicy(policy).Ok);
        s.CompleteReconciliation([]);
        var away = new SemanticPlanProposeRequest(Guid.NewGuid(), _r1, "r1", policy.SemanticMapFingerprint, 1,
            Line(0.0, -0.745, 0.0, -1.6), null, null, null, PlanHash: "h1", CommandId: Guid.NewGuid());
        Assert.True(s.AcquireSemanticPlan(away).Granted);
        Assert.DoesNotContain("zone:ZONE-SINGLE-CENTER", View(s, _r1).OccupiedResourceIds);

        // Driving into it still takes it.
        var into = new SemanticPlanProposeRequest(Guid.NewGuid(), _r2, "r2", policy.SemanticMapFingerprint, 1,
            Line(1.5, 0.3, 0.3, 0.3), null, null, null, PlanHash: "h2", CommandId: Guid.NewGuid());
        s.AcquireSemanticPlan(into);
        Assert.Contains("zone:ZONE-SINGLE-CENTER", View(s, _r2).OccupiedResourceIds);
    }

    [Fact]
    public void An_idle_robot_next_to_a_zone_lets_go_of_a_zone_seeded_at_a_stale_pose()
    {
        var s = NewState();
        Assert.True(s.EnsureTracked(_r1, 0.0, 0.0, localizationOk: true).Ok);  // provisional (0, 0): inside the zone
        Assert.True(s.MarkOnline(_r1, 0.0, -0.745, localizationOk: true).Ok);   // localized 0.245 m below the zone
        Assert.DoesNotContain("zone:ZONE-SINGLE-CENTER", View(s, _r1).OccupiedResourceIds);
    }
}
