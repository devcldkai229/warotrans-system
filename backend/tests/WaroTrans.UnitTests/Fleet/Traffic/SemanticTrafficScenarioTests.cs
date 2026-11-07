using System.Collections.Immutable;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// Stage-3 (Semantic) reservation lifecycle, scenario by scenario (A–L of the real-robot acceptance list). Every
/// scenario asserts who holds what, who waits on whom, which authority is current and what reached the robot
/// (grant / renew / revoke events). Two robots never hold the same cell or zone.
/// </summary>
public class SemanticTrafficScenarioTests
{
    private static readonly SemanticZonePoly ShelfZone = new(
        "ZONE-SHELF", ImmutableArray.Create((3.0, -0.5), (4.0, -0.5), (4.0, 0.5), (3.0, 0.5)));

    private readonly FakeTimeProvider _clock = new();
    private readonly SemanticTrafficPolicy _policy = new(
        "fp-scenario", Guid.NewGuid(), "MAP-TEST", CellSizeMeters: 0.25, HorizonMeters: 4.0,
        FootprintHalfLength: 0.18, FootprintHalfWidth: 0.15, [ShelfZone], [], PathToleranceMeters: 0.15);

    private readonly Guid _r1 = new("00000000-0000-0000-0000-0000000000a1");
    private readonly Guid _r2 = new("00000000-0000-0000-0000-0000000000b2");
    private readonly Guid _r3 = new("00000000-0000-0000-0000-0000000000c3");
    private readonly Guid _cmd1 = Guid.NewGuid();
    private readonly Guid _cmd2 = Guid.NewGuid();
    private readonly Guid _cmd3 = Guid.NewGuid();

    private TrafficState NewState(bool requireLease = false)
    {
        var state = new TrafficState(
            new TrafficOptions
            {
                Mode = TrafficCoordinatorMode.Semantic,
                EventLogCapacity = 256,
                AuthorityTtlSec = 30,
                LocalizationMarginMeters = 0.05,
                RequireCoordinatorLease = requireLease
            },
            _clock);
        state.BeginEpoch(100);
        Assert.True(state.BindSemanticPolicy(_policy).Ok);
        state.CompleteReconciliation([]);
        return state;
    }

    private static ImmutableArray<SemanticPlanPose> Line(double x0, double y0, double x1, double y1)
    {
        var n = 10;
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

    // ------------------------------------------------------------------ A

    [Fact]
    public void A_single_robot_grant_renew_verified_exit_release()
    {
        var s = NewState();
        var grant = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0)));
        Assert.True(grant.Granted);
        var granted = s.DrainEvents().Single(e => e.Kind == TrafficEventKind.AuthorityGranted);
        Assert.Equal(_cmd1, granted.Authority.CommandId);
        Assert.Equal("h1", granted.Authority.PlanHash);
        Assert.Equal(100, granted.Authority.Epoch);
        Assert.All(grant.Authority!.ResourceIds, rid => Assert.Contains(_r1, s.Snapshot().Resources.Single(r => r.ResourceId == rid).Holders));

        // Renew keeps the same authority, bumps seq, moves expiry.
        _clock.Advance(TimeSpan.FromSeconds(1));
        Assert.True(s.RenewAuthority(_r1, grant.Authority.AuthorityId, 100, TimeSpan.FromSeconds(30)).Ok);
        var renewed = s.DrainEvents().Single(e => e.Kind == TrafficEventKind.AuthorityRenewed);
        Assert.Equal(grant.Authority.AuthorityId, renewed.Authority.AuthorityId);
        Assert.True(renewed.Authority.Seq > grant.Authority.Seq);

        // Driven to x=2: the cells around the start are behind it and verified clear.
        var behind = grant.Authority.ResourceIds
            .Where(rid => SemanticReservation.IsPhysicallyClearOfResources(_policy, 2.0, 0, [rid], 0.05))
            .ToImmutableArray();
        Assert.NotEmpty(behind);
        Assert.True(s.ReportVerifiedExit(_r1, renewed.Authority.Seq + 1, 100, behind, 2.0, 0, true).Ok);
        // Released: what is far behind. Kept: what is still under the robot or within the path still ahead of it.
        var farBehind = behind.Where(rid => SemanticReservation.IsPhysicallyClearOfResources(
            _policy, 2.0, 0, [rid], _policy.ReserveRadiusMeters)).ToList();
        Assert.NotEmpty(farBehind);
        Assert.All(farBehind, rid => Assert.DoesNotContain(rid, View(s, _r1).OccupiedResourceIds));

        // NAVIGATE result with a fresh pose: authority cleared, only what is under the robot stays.
        Assert.True(s.CompleteRoute(_r1, true, null, commandId: _cmd1, poseX: 2.0, poseY: 0).Ok);
        Assert.Contains(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityReleased);
        var after = View(s, _r1);
        Assert.Null(after.Authority);
        Assert.Equal(TrafficRobotPhase.Idle, after.Phase);
        Assert.All(after.OccupiedResourceIds, rid =>
            Assert.False(SemanticReservation.IsPhysicallyClearOfResources(_policy, 2.0, 0, [rid], 0.05)));
        Assert.Empty(s.ActiveAuthorityKeys()); // renew stops
    }

    [Fact]
    public void Snapshot_with_a_semantic_grant_serializes()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0))).Granted);
        // The operator API returned 500: a default ImmutableArray in the authority cannot be written as JSON.
        var json = System.Text.Json.JsonSerializer.Serialize(s.Snapshot());
        Assert.Contains("\"PlanRevision\":1", json);
    }

    [Fact]
    public void A_negative_exit_of_a_cell_still_under_the_robot_is_refused()
    {
        var s = NewState();
        var grant = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0)));
        var under = grant.Authority!.ResourceIds
            .Where(rid => !SemanticReservation.IsPhysicallyClearOfResources(_policy, 0, 0, [rid], 0.05))
            .ToImmutableArray();
        Assert.Equal("NOT_CLEARED", s.ReportVerifiedExit(_r1, grant.Authority.Seq + 1, 100, under, 0, 0, true).Reason);
        Assert.All(under, rid => Assert.Contains(rid, View(s, _r1).OccupiedResourceIds));
    }

    [Fact]
    public void A_negative_route_result_without_a_fresh_pose_releases_nothing()
    {
        var s = NewState();
        var grant = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0)));
        var held = View(s, _r1).OccupiedResourceIds;
        Assert.True(s.CompleteRoute(_r1, true, null, commandId: _cmd1).Ok);
        Assert.Equal(held.ToArray(), View(s, _r1).OccupiedResourceIds.ToArray());
        Assert.Null(View(s, _r1).Authority);
        Assert.NotNull(grant.Authority);
    }

    // ------------------------------------------------------------------ B

    [Fact]
    public void B_two_robots_on_independent_paths_are_both_granted()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 3, 0))).Granted);
        Assert.True(s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(0, 5, 3, 5))).Granted);
        Assert.Empty(View(s, _r1).OccupiedResourceIds.Intersect(View(s, _r2).OccupiedResourceIds));
        Assert.Equal(2, s.DrainEvents().Count(e => e.Kind == TrafficEventKind.AuthorityGranted));
        Assert.Empty(s.Snapshot().Waits);
        AssertNoSharedResource(s);
    }

    [Fact]
    public void B_robot_parked_since_it_came_online_is_seeded_and_nobody_is_granted_through_it()
    {
        var s = NewState();
        // r2 came online after start-up and has not moved: its verified heartbeat pose seeds its spot.
        Assert.True(s.MarkOnline(_r2, 2.0, 0.0, true).Ok);
        Assert.NotEmpty(View(s, _r2).OccupiedResourceIds);
        var through = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 4, 0)));
        Assert.True(through.Queued);
        Assert.Equal(_r2, through.BlockingOwner);
        // Not localized → not seeded (and nothing else changes).
        Assert.True(s.MarkOnline(_r3, 9, 9, false).Ok);
        Assert.Empty(View(s, _r3).OccupiedResourceIds);
    }

    // ------------------------------------------------------------------ C

    [Fact]
    public void C_single_occupancy_zone_admits_one_robot_and_the_waiter_goes_after_verified_exit()
    {
        var s = NewState();
        var g1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(2.5, 0, 6.5, 0)));
        Assert.Contains("zone:ZONE-SHELF", g1.Authority!.ResourceIds);
        // r2 enters the same zone from the other side, far enough that only the zone is shared.
        var g2 = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(3.5, 3, 3.5, 0)));
        Assert.True(g2.Queued);
        Assert.Equal(_r1, g2.BlockingOwner);
        Assert.Equal(TrafficRobotPhase.Waiting, View(s, _r2).Phase);
        Assert.Contains(s.Snapshot().Waits, w => w.RobotId == _r2 && w.ResourceId == "zone:ZONE-SHELF");
        s.DrainEvents();

        // Negative: r1 still inside the zone — its exit report does not release it, r2 keeps waiting.
        Assert.Equal("NOT_CLEARED",
            s.ReportVerifiedExit(_r1, g1.Authority.Seq + 1, 100, ["zone:ZONE-SHELF"], 3.6, 0, true).Reason);
        Assert.Null(View(s, _r2).Authority);

        // r1 has driven out (x=5.5): every cell and the zone it left are released → r2 promoted in the same step.
        var left = View(s, _r1).OccupiedResourceIds
            .Where(rid => SemanticReservation.IsPhysicallyClearOfResources(_policy, 5.5, 0, [rid], 0.05))
            .ToImmutableArray();
        Assert.Contains("zone:ZONE-SHELF", left);
        Assert.True(s.ReportVerifiedExit(_r1, g1.Authority.Seq + 2, 100, left, 5.5, 0, true).Ok);
        Assert.NotNull(View(s, _r2).Authority);
        Assert.Contains(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityGranted && e.RobotId == _r2);
        Assert.Contains(_r2, s.Snapshot().Resources.Single(r => r.ResourceId == "zone:ZONE-SHELF").Holders);
        AssertNoSharedResource(s);
    }

    // ------------------------------------------------------------------ D

    [Fact]
    public void D_paths_crossing_in_unmarked_free_space_conflict_on_cells()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 8, 4, 8))).Granted);
        var crossing = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(2, 10, 2, 6)));
        Assert.False(crossing.Granted);
        Assert.True(crossing.Queued);
        Assert.Equal(_r1, crossing.BlockingOwner);
        Assert.Empty(View(s, _r2).OccupiedResourceIds);
        AssertNoSharedResource(s);
    }

    // ------------------------------------------------------------------ E

    [Fact]
    public void E_opposite_directions_in_a_narrow_corridor_are_never_authorized_together()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, -4, 3.5, -4))).Granted);
        var head_on = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(3.5, -4, 0, -4)));
        Assert.False(head_on.Granted);
        Assert.Null(View(s, _r2).Authority);
        Assert.Single(s.ActiveAuthorityKeys());
        AssertNoSharedResource(s);
    }

    // ------------------------------------------------------------------ F

    [Fact]
    public void F_replan_onto_reserved_space_revokes_the_old_authority_and_grants_nothing_new()
    {
        var s = NewState();
        var g1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0)));
        Assert.True(s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(0, 3, 3, 3))).Granted);
        s.DrainEvents();

        // r1 replans (rev 2) from x=1 across r2's reservation.
        var replan = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 2, Line(1, 0, 1, 3.5)));
        Assert.False(replan.Granted);
        Assert.True(replan.Queued);
        var events = s.DrainEvents();
        var revoke = Assert.Single(events, e => e.Kind == TrafficEventKind.AuthorityRevoked);
        Assert.Equal(g1.Authority!.AuthorityId, revoke.Authority.AuthorityId);
        Assert.Equal(_cmd1, revoke.CommandId);
        Assert.DoesNotContain(events, e => e.Kind == TrafficEventKind.AuthorityGranted);
        Assert.Null(View(s, _r1).Authority);
        // Nothing of r2 moved to r1; what r1 still stands on is kept.
        AssertNoSharedResource(s);
        Assert.Contains(View(s, _r1).OccupiedResourceIds, rid =>
            !SemanticReservation.IsPhysicallyClearOfResources(_policy, 1, 0, [rid], 0.05));
    }

    [Fact]
    public void F_delayed_older_plan_revision_cannot_replace_the_current_grant()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 5, Line(0, 0, 2, 0))).Granted);
        var stale = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 4, Line(0, 0, 0, 2)));
        Assert.Equal("STALE_PLAN_REVISION", stale.Reason);
        Assert.Equal(5, View(s, _r1).Authority!.PlanRevision);
    }

    // ------------------------------------------------------------------ G

    [Fact]
    public void G_robot_that_disappears_keeps_its_occupancy_quarantined()
    {
        var s = NewState();
        var g1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0)));
        var held = View(s, _r1).OccupiedResourceIds;
        Assert.True(s.MarkOffline(_r1).Ok);
        _clock.Advance(TimeSpan.FromMinutes(10));

        var view = View(s, _r1);
        Assert.Equal(TrafficRobotPhase.Quarantined, view.Phase);
        Assert.Equal("OFFLINE", view.QuarantineReason);
        Assert.Equal(held.ToArray(), view.OccupiedResourceIds.ToArray());
        // Nobody is granted into it, and its renew is no longer issued.
        Assert.False(s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(2, 0, 0, 0))).Granted);
        Assert.DoesNotContain(s.ActiveAuthorityKeys(), k => k.RobotId == _r1);
        Assert.NotNull(g1.Authority);
        AssertNoSharedResource(s);
    }

    [Fact]
    public void G_navigate_aborted_for_offline_loses_its_authority_so_the_robot_cannot_resume_it()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0))).Granted);
        s.DrainEvents();
        // Connectivity monitor: NAVIGATE aborted (ROBOT_OFFLINE), then OFFLINE quarantine.
        Assert.True(s.CompleteRoute(_r1, false, "ROBOT_OFFLINE", commandId: _cmd1).Ok);
        Assert.True(s.MarkOffline(_r1).Ok);
        Assert.Contains(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityRevoked);
        var view = View(s, _r1);
        Assert.Null(view.Authority);
        Assert.Equal("OFFLINE", view.QuarantineReason);
        Assert.NotEmpty(view.OccupiedResourceIds);
        // Back where it stopped: online again, but nothing to renew — the aborted command never moves again.
        Assert.True(s.MarkOnline(_r1, 0.1, 0, true).Ok);
        Assert.Empty(s.ActiveAuthorityKeys());
        Assert.Equal(TrafficRobotPhase.Idle, View(s, _r1).Phase);
    }

    // ------------------------------------------------------------------ H

    [Fact]
    public void H_reconnect_needs_localized_pose_and_reconcile_then_the_waiter_proceeds()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0))).Granted);
        Assert.True(s.MarkOffline(_r1).Ok);
        var waiter = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(0, 1.2, 0, -1.5)));
        Assert.True(waiter.Queued);

        // Heartbeat without pose: still quarantined.
        Assert.False(s.MarkOnline(_r1).Ok);
        Assert.Equal("RECONNECT_UNVERIFIED", View(s, _r1).QuarantineReason);
        // Not localized: reconcile refused.
        Assert.False(s.ReconcileRobot(_r1, 1.8, 0, false, []).Ok);
        Assert.Equal(TrafficRobotPhase.Quarantined, View(s, _r1).Phase);

        // Robot reports idle + localized at x=1.8: what it left (around x=0) is released, r2 promoted.
        Assert.True(s.ReconcileRobot(_r1, 1.8, 0, true, []).Ok);
        Assert.Equal(TrafficRobotPhase.Idle, View(s, _r1).Phase);
        Assert.Null(View(s, _r1).Authority);
        Assert.NotNull(View(s, _r2).Authority);
        AssertNoSharedResource(s);
    }

    // ------------------------------------------------------------------ I

    [Fact]
    public void I_cancel_keeps_occupancy_and_quarantines_until_verified()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0))).Granted);
        var held = View(s, _r1).OccupiedResourceIds;
        Assert.True(s.CancelRequest(_r1, null).Ok);
        var view = View(s, _r1);
        Assert.Equal("CANCEL_WHILE_OCCUPIED", view.QuarantineReason);
        Assert.Equal(held.ToArray(), view.OccupiedResourceIds.ToArray());
        Assert.Contains(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityRevoked);
    }

    [Fact]
    public void I_failed_navigation_revokes_and_quarantines_but_a_late_result_of_another_command_is_ignored()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0))).Granted);
        s.DrainEvents();

        // Result of an older NAVIGATE (superseded): ignored.
        Assert.Equal("COMMAND_MISMATCH", s.CompleteRoute(_r1, false, "TIMEOUT", commandId: Guid.NewGuid()).Reason);
        Assert.NotNull(View(s, _r1).Authority);

        Assert.True(s.CompleteRoute(_r1, false, "NAVIGATION_FAILED", commandId: _cmd1).Ok);
        var view = View(s, _r1);
        Assert.Equal("NAVIGATE:NAVIGATION_FAILED", view.QuarantineReason);
        Assert.Null(view.Authority);
        Assert.NotEmpty(view.OccupiedResourceIds);
        Assert.Contains(s.DrainEvents(), e => e.Kind == TrafficEventKind.AuthorityRevoked);
        Assert.Equal("QUARANTINED:NAVIGATE:NAVIGATION_FAILED",
            s.AcquireSemanticPlan(Plan(_r1, _cmd2, 1, Line(2, 0, 3, 0))).Reason);
    }

    // ------------------------------------------------------------------ J

    [Fact]
    public void J_duplicate_stale_and_wrong_messages_change_nothing()
    {
        var s = NewState();
        var g = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0)));
        s.DrainEvents();

        // Duplicate traffic_plan (QoS1 redelivery): same authority, renewed — not a second grant.
        var dup = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0)));
        Assert.Equal(g.Authority!.AuthorityId, dup.Authority!.AuthorityId);
        var events = s.DrainEvents();
        Assert.DoesNotContain(events, e => e.Kind == TrafficEventKind.AuthorityGranted);
        Assert.Contains(events, e => e.Kind == TrafficEventKind.AuthorityRenewed);

        // Renew of an authority the robot no longer has, or from another epoch.
        Assert.Equal("AUTHORITY_MISMATCH", s.RenewAuthority(_r1, Guid.NewGuid(), 100, TimeSpan.FromSeconds(30)).Reason);
        Assert.Equal("STALE_EPOCH", s.RenewAuthority(_r1, g.Authority.AuthorityId, 99, TimeSpan.FromSeconds(30)).Reason);

        // Reordered progress: a newer report first, then the older one.
        var seq = View(s, _r1).LastSeq;
        Assert.True(s.ReportProgress(_r1, seq + 2, 100, null, 0.5, 0, true).Ok);
        Assert.Equal("STALE_SEQ", s.ReportProgress(_r1, seq + 1, 100, null, 0.1, 0, true).Reason);
        Assert.Equal("STALE_EPOCH", s.ReportVerifiedExit(_r1, seq + 3, 99, [], 0, 0, true).Reason);
        Assert.Equal(0.5, View(s, _r1).X);
    }

    // ------------------------------------------------------------------ K

    [Fact]
    public void K_restart_new_epoch_rebuilds_occupancy_before_any_grant()
    {
        // New host: epoch grows; seeds arrive before the policy is bound.
        var s = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 }, _clock);
        s.BeginEpoch(200);
        s.CompleteReconciliation(
        [
            new TrafficReconcileSeed(_r1, null, [], 1.0, 0.0, true, true, InMotion: false),
            new TrafficReconcileSeed(_r2, null, [], 1.0, 3.0, true, true, InMotion: true),
            new TrafficReconcileSeed(_r3, null, [], null, null, false, false)
        ]);
        Assert.Equal("AwaitingPolicy", s.Snapshot().Phase);
        Assert.Equal("SEMANTIC_POLICY_UNBOUND", s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 1, 0))).Reason);

        Assert.True(s.BindSemanticPolicy(_policy).Ok);
        Assert.Equal("Ready", s.Snapshot().Phase);
        Assert.Equal(TrafficRobotPhase.Idle, View(s, _r1).Phase);
        Assert.NotEmpty(View(s, _r1).OccupiedResourceIds);
        Assert.Equal("RECONCILE_IN_MOTION", View(s, _r2).QuarantineReason);
        Assert.NotEmpty(View(s, _r2).OccupiedResourceIds);
        Assert.Equal("RECONCILE_UNCERTAIN", View(s, _r3).QuarantineReason);

        // A robot of the old epoch cannot renew; nobody is granted onto the seeded robot.
        Assert.Equal("STALE_EPOCH", s.RenewAuthority(_r1, Guid.NewGuid(), 100, TimeSpan.FromSeconds(30)).Reason);
        Assert.False(s.AcquireSemanticPlan(Plan(_r3, _cmd3, 1, Line(-1, 0, 1, 0))).Granted);
        // RECONCILE_IN_MOTION is not lifted by a heartbeat.
        Assert.True(s.MarkOnline(_r2, 1.0, 3.0, true).Ok);
        Assert.Equal("RECONCILE_IN_MOTION", View(s, _r2).QuarantineReason);
    }

    [Fact]
    public void K_no_grant_before_the_lease_is_held_and_the_epoch_announced()
    {
        var s = NewState(requireLease: true);
        Assert.Equal("NOT_LEADER", s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 1, 0))).Reason);
        s.SetOpenForGrants(true, "test");
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 1, 0))).Granted);
        s.SetOpenForGrants(false, "lease-lost");
        Assert.Equal("NOT_LEADER", s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(0, 5, 1, 5))).Reason);
    }

    [Fact]
    public void K_lease_takeover_is_a_new_epoch_that_forgets_the_standby_view_and_rebuilds_from_the_seeds()
    {
        var s = NewState();
        Assert.True(s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 2, 0))).Granted);
        var before = s.Epoch;

        s.BeginEpoch(before + 1);
        s.CompleteReconciliation([new TrafficReconcileSeed(_r2, null, [], 8, 8, true, true)]);

        Assert.True(s.Epoch > before);
        Assert.Equal("Ready", s.Snapshot().Phase);
        Assert.DoesNotContain(s.Snapshot().Robots, r => r.RobotId == _r1);
        Assert.NotEmpty(View(s, _r2).OccupiedResourceIds);
    }

    [Fact]
    public void K_a_standby_host_tracks_and_grants_nothing()
    {
        var s = NewState(requireLease: true);
        Assert.Equal("NOT_LEADER", s.EnsureTracked(_r1, 0, 0, true).Reason);
        Assert.Equal("NOT_LEADER", s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 0, 1, 0))).Reason);
    }

    // ------------------------------------------------------------------ L

    [Fact]
    public void L_wait_for_cycle_is_refused_without_granting_either_robot()
    {
        var s = NewState();
        // Each robot stands where the other wants to go.
        Assert.True(s.EnsureTracked(_r1, 0, 6, true).Ok);
        Assert.True(s.EnsureTracked(_r2, 3, 6, true).Ok);
        var r1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, 6, 3, 6)));
        Assert.True(r1.Queued);
        Assert.Equal(_r2, r1.BlockingOwner);
        var r2 = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(3, 6, 0, 6)));
        Assert.False(r2.Granted);
        Assert.Equal("DEADLOCK_RISK", r2.Reason);
        Assert.Empty(s.ActiveAuthorityKeys());
        AssertNoSharedResource(s);
    }

    [Fact]
    public void L_earlier_waiter_is_served_first_and_keeps_its_place_when_it_re_proposes()
    {
        var s = NewState();
        // r1 holds the corridor x∈[0,3] at y=-8.
        var g1 = s.AcquireSemanticPlan(Plan(_r1, _cmd1, 1, Line(0, -8, 3, -8)));
        // r2 waits for it (wants x∈[2,5]).
        var w2 = s.AcquireSemanticPlan(Plan(_r2, _cmd2, 1, Line(5, -8, 2, -8)));
        Assert.True(w2.Queued);
        var seq2 = s.Snapshot().Waits.First(w => w.RobotId == _r2).EnqueueSeq;
        _clock.Advance(TimeSpan.FromSeconds(30));
        // r2 re-proposes the same route: keeps its queue position.
        Assert.True(s.AcquireSemanticPlan(Plan(_r2, _cmd2, 2, Line(5, -8, 2, -8))).Queued);
        Assert.Equal(seq2, s.Snapshot().Waits.First(w => w.RobotId == _r2).EnqueueSeq);

        // r3 arrives later wanting free cells r2 is also waiting for (x∈[4,6]): it may not barge in front of r2.
        var w3 = s.AcquireSemanticPlan(Plan(_r3, _cmd3, 1, Line(6.5, -8, 4.5, -8)));
        Assert.True(w3.Queued);
        Assert.Equal(_r2, w3.BlockingOwner);
        Assert.Empty(View(s, _r3).OccupiedResourceIds);

        // r1 leaves (verified at x=20): r2 is granted first.
        var left = View(s, _r1).OccupiedResourceIds.ToImmutableArray();
        Assert.True(s.ReportVerifiedExit(_r1, g1.Authority!.Seq + 1, 100, left, 20, -8, true).Ok);
        Assert.NotNull(View(s, _r2).Authority);
        Assert.Null(View(s, _r3).Authority);
        AssertNoSharedResource(s);
    }
}
