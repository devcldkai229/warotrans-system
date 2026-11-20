using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// A robot that waits behind a closed gate keeps only what its body stands on. Holding the part of its plan it never
/// entered let a robot docking into a bay and a robot in the corridor next to it each hold a strip the other needed
/// (MAP-ONE-V013, 2026-11-19): a wait-for cycle between two robots 0.9 m apart with a wall between them.
/// </summary>
public class SemanticWaitingOccupancyTests
{
    private readonly SemanticTrafficPolicy _policy = new(
        "fp-waiting", Guid.NewGuid(), "MAP-TEST", CellSizeMeters: 0.25, HorizonMeters: 4.0,
        FootprintHalfLength: 0.18, FootprintHalfWidth: 0.15, [], [], PathToleranceMeters: 0.15);

    private readonly Guid _waiter = new("00000000-0000-0000-0000-0000000000a1");
    private readonly Guid _blocker = new("00000000-0000-0000-0000-0000000000b2");

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
        const int n = 30;
        var yaw = Math.Atan2(y1 - y0, x1 - x0);
        return Enumerable.Range(0, n + 1)
            .Select(i => new SemanticPlanPose(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, yaw))
            .ToImmutableArray();
    }

    private SemanticPlanProposeRequest Plan(Guid robot, Guid command, long revision, ImmutableArray<SemanticPlanPose> poses) =>
        new(Guid.NewGuid(), robot, robot.ToString("N")[..6], _policy.SemanticMapFingerprint, revision, poses,
            null, null, null, PlanHash: $"h{revision}", CommandId: command);

    private static RobotTrafficView View(TrafficState s, Guid robot) => s.Snapshot().Robots.Single(r => r.RobotId == robot);

    [Fact]
    public void A_waiting_robot_releases_the_part_of_its_plan_it_never_entered()
    {
        var s = NewState();
        var waiterCmd = Guid.NewGuid();
        // 1.0–1.25 m ahead of the waiter, well past its body (0.29 m with the localization margin).
        const string ahead = "cell:0:4";

        Assert.True(s.AcquireSemanticPlan(Plan(_blocker, Guid.NewGuid(), 1, Line(-2, 3, 2, 3))).Granted);
        Assert.True(s.AcquireSemanticPlan(Plan(_waiter, waiterCmd, 1, Line(0, 0, 0, 1.5))).Granted);

        // Replanned through the blocker: refused, the grant is revoked, the robot stops and waits.
        var replan = s.AcquireSemanticPlan(Plan(_waiter, waiterCmd, 2, Line(0, 0, 0, 3)));
        Assert.False(replan.Granted);
        Assert.Equal(TrafficRobotPhase.Waiting, View(s, _waiter).Phase);
        Assert.Contains(ahead, View(s, _waiter).OccupiedResourceIds);

        // Still waiting, it asks again: it no longer holds what lies ahead of its body.
        Assert.False(s.AcquireSemanticPlan(Plan(_waiter, waiterCmd, 3, Line(0, 0, 0, 3))).Granted);
        var held = View(s, _waiter).OccupiedResourceIds;
        Assert.DoesNotContain(ahead, held);
        Assert.Contains("cell:0:0", held); // its body stays reserved
    }

    [Fact]
    public void A_robot_replanning_under_a_grant_keeps_its_reservation_ahead()
    {
        var s = NewState();
        var cmd = Guid.NewGuid();
        Assert.True(s.AcquireSemanticPlan(Plan(_waiter, cmd, 1, Line(0, 0, 0, 1.5))).Granted);

        // A moving robot replans along the same lane: what it was driving into stays held.
        Assert.True(s.AcquireSemanticPlan(Plan(_waiter, cmd, 2, Line(0, 0.1, 0, 1.5))).Granted);
        Assert.Contains("cell:0:4", View(s, _waiter).OccupiedResourceIds);
    }
}
