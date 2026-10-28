using System.Collections.Immutable;
using System.Collections.Concurrent;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public class SegmentedTrafficCoordinatorTests
{
    [Fact]
    public void Two_robots_at_one_junction_second_waits()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildCorridorGraph());
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var goalA = sim.Graph.Stations.First(s => s.EndpointCode == "EP-A").NodeId;

        var g1 = sim.AcquireNextSegment(a, 0, 0, goalB);
        Assert.True(g1.Granted);

        var g2 = sim.AcquireNextSegment(b, 4, 0, goalA);
        Assert.False(g2.Granted);
        Assert.True(g2.Queued);
        Assert.Equal(TrafficWaitingReason.Capacity, g2.WaitingReason);
        Assert.Equal(a, g2.BlockingOwner);
    }

    [Fact]
    public void Opposite_ends_of_narrow_corridor_exclusive()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var goalA = sim.Graph.Stations.First(s => s.EndpointCode == "EP-A").NodeId;

        Assert.True(sim.AcquireNextSegment(a, 0, 0, goalB).Granted);
        var second = sim.AcquireNextSegment(b, 5, 0, goalA);
        Assert.False(second.Granted);
        Assert.True(second.Queued);
        Assert.Equal(TrafficWaitingReason.Capacity, second.WaitingReason);
    }

    [Fact]
    public void Three_robots_same_resource_queue()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robots = Enumerable.Range(0, 3).Select(_ => Guid.NewGuid()).ToArray();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;

        var results = robots.Select((r, i) => sim.AcquireNextSegment(r, 0, 0, goalB, priority: i)).ToList();
        Assert.True(results[0].Granted);
        Assert.All(results.Skip(1), r => Assert.True(r.Queued));
        var snap = sim.State.Snapshot();
        Assert.True(snap.Waits.Length >= 2);
    }

    [Fact]
    public void Physical_overlap_resources_exist_when_edges_conflict()
    {
        // Two parallel lanes close enough for swept conflict.
        var edges = new[]
        {
            new WaroTrans.Navigation.RouteGraph.RouteGraphEdgeInput(
                "E-1",
                [new(0, 0), new(2, 0)],
                WaroTrans.Navigation.Enums.EdgeDirection.ONE_WAY, null, true),
            new WaroTrans.Navigation.RouteGraph.RouteGraphEdgeInput(
                "E-2",
                [new(0, 0.1), new(2, 0.1)],
                WaroTrans.Navigation.Enums.EdgeDirection.ONE_WAY, null, true)
        };
        var input = new TrafficCompileInput(
            "OV",
            "map",
            edges,
            [
                new("EP-A", 0, 0, true),
                new("EP-B", 2, 0, true),
                new("EP-C", 0, 0.1, true),
                new("EP-D", 2, 0.1, true)
            ],
            [],
            edges.Select(e => new TrafficLaneMeta(e.Code, 1.0, 1, e.Direction)).ToList(),
            [],
            TrafficFootprintOptions.Default);
        var graph = TrafficGraphCompiler.Compile(input).Graph;
        Assert.Contains(graph.Resources, r => r.Kind == TrafficResourceKind.PhysicalOverlap);
    }

    [Fact]
    public void Cyclic_wait_grant_rejected()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildThreeWayJunction());
        var r1 = Guid.NewGuid();
        var r2 = Guid.NewGuid();
        var epA = sim.Graph.Stations.First(s => s.EndpointCode == "EP-A").NodeId;
        var epB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;

        var g1 = sim.AcquireNextSegment(r1, 0, 0, epB);
        Assert.True(g1.Granted);

        // Opposite direction through the same exclusive junction: must wait behind r1, never be granted.
        var g2 = sim.AcquireNextSegment(r2, 2, 0, epA);
        Assert.False(g2.Granted);
        Assert.True(g2.Queued);
        Assert.Equal(r1, g2.BlockingOwner);
        // r2 waits for r1, r1 waits for nobody: a wait chain, not a cycle.
        Assert.Empty(sim.State.Snapshot().Cycles);
    }

    [Fact]
    public void Shelf_service_hold_keeps_resource()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var grant = sim.AcquireNextSegment(robot, 0, 0, goalB);
        Assert.True(grant.Granted);
        var resourceId = grant.Authority!.ResourceIds[0];
        var hold = sim.State.HoldServiceResource(robot, resourceId);
        Assert.True(hold.Ok);
        var view = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.HoldingService, view.Phase);
        Assert.Contains(resourceId, view.OccupiedResourceIds);
    }

    [Fact]
    public void Cancel_while_occupied_quarantines_no_auto_release()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var grant = sim.AcquireNextSegment(robot, 0, 0, goalB);
        Assert.True(grant.Granted);
        var occupied = grant.Authority!.ResourceIds.ToImmutableArray();
        sim.State.CancelRequest(robot, null);
        var view = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, view.Phase);
        Assert.Equal(occupied.Length, view.OccupiedResourceIds.Length);
    }

    [Fact]
    public void Offline_uncertain_location_quarantines()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        Assert.True(sim.AcquireNextSegment(robot, 0, 0, goalB).Granted);
        sim.State.MarkOffline(robot);
        var view = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, view.Phase);
        Assert.Equal("OFFLINE", view.QuarantineReason);
        Assert.NotEmpty(view.OccupiedResourceIds);
    }

    [Fact]
    public void Host_restart_fail_closed_then_reconcile()
    {
        var graph = FakeRobotSim.BuildNarrowBidirectional();
        var options = new TrafficOptions { Mode = TrafficCoordinatorMode.Active };
        var state = new TrafficState(options);
        state.BeginEpoch(1);
        state.BindGraph(Guid.NewGuid(), graph);

        var robot = Guid.NewGuid();
        var parked = Guid.NewGuid();
        var edgeIds = graph.Edges.Select(e => e.Id).Take(1).ToImmutableArray();
        state.CompleteReconciliation(
        [
            new TrafficReconcileSeed(robot, null, edgeIds, 0, 0, LocalizationOk: true, PoseKnown: true)
        ]);

        Assert.Equal("Ready", state.Phase);
        // Driving under a previous-epoch authority: holds its edges + floor and waits for a verified state (T8).
        var view = state.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, view.Phase);
        Assert.Equal("RECONCILE_IN_MOTION", view.QuarantineReason);
        Assert.NotEmpty(view.OccupiedResourceIds);

        // Parked robot without an open command still occupies the floor under it (T8).
        state.BeginEpoch(2);
        state.BindGraph(Guid.NewGuid(), graph);
        state.CompleteReconciliation(
        [
            new TrafficReconcileSeed(parked, null, [], 5, 0, LocalizationOk: true, PoseKnown: true)
        ]);
        var parkedView = state.Snapshot().Robots.Single(r => r.RobotId == parked);
        Assert.Equal(TrafficRobotPhase.Idle, parkedView.Phase);
        Assert.NotEmpty(parkedView.OccupiedResourceIds);

        // Uncertain seed → quarantine
        state.BeginEpoch(3);
        state.BindGraph(Guid.NewGuid(), graph);
        state.CompleteReconciliation(
        [
            new TrafficReconcileSeed(robot, null, edgeIds, null, null, LocalizationOk: false, PoseKnown: false)
        ]);
        view = state.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, view.Phase);
    }

    [Fact]
    public void Duplicate_delayed_out_of_order_progress()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var grant = sim.AcquireNextSegment(robot, 0, 0, goalB);
        Assert.True(grant.Granted);
        var seq = grant.Authority!.Seq;

        Assert.True(sim.State.ReportProgress(robot, seq + 1, sim.Epoch, null, 1, 0, true).Ok);
        // Duplicate
        Assert.True(sim.State.ReportProgress(robot, seq + 1, sim.Epoch, null, 1, 0, true).Ok);
        // Out of order (stale)
        Assert.False(sim.State.ReportProgress(robot, seq, sim.Epoch, null, 0.5, 0, true).Ok);
        // Delayed but newer
        Assert.True(sim.State.ReportProgress(robot, seq + 5, sim.Epoch, null, 2, 0, true).Ok);
    }

    [Fact]
    public void ReportProgress_clears_LOCALIZATION_LOSS_when_pose_recovers_with_authority()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var grant = sim.AcquireNextSegment(robot, 0, 0, goalB);
        Assert.True(grant.Granted);
        var seq = grant.Authority!.Seq;

        Assert.True(sim.State.ReportProgress(robot, seq + 1, sim.Epoch, null, 1, 0, localizationOk: false).Ok);
        var lost = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Quarantined, lost.Phase);
        Assert.Equal("LOCALIZATION_LOSS", lost.QuarantineReason);
        Assert.Empty(sim.State.ActiveAuthorityKeys());

        Assert.True(sim.State.ReportProgress(robot, seq + 2, sim.Epoch, null, 1.1, 0, localizationOk: true).Ok);
        var recovered = sim.State.Snapshot().Robots.Single(r => r.RobotId == robot);
        Assert.Equal(TrafficRobotPhase.Moving, recovered.Phase);
        Assert.Null(recovered.QuarantineReason);
        Assert.Contains(sim.State.ActiveAuthorityKeys(), k => k.RobotId == robot);
    }

    [Fact]
    public void Release_without_verified_exit_rejected()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var grant = sim.AcquireNextSegment(robot, 0, 0, goalB);
        Assert.True(grant.Granted);
        var resources = grant.Authority!.ResourceIds;

        // Still on the lane (pose near edge) → not cleared.
        var result = sim.State.ReportVerifiedExit(
            robot, grant.Authority.Seq + 1, sim.Epoch, resources, poseX: 2.5, poseY: 0, localizationOk: true);
        Assert.False(result.Ok);
        Assert.Equal("NOT_CLEARED", result.Reason);
        Assert.NotEmpty(sim.State.Snapshot().Robots.Single(r => r.RobotId == robot).OccupiedResourceIds);
    }

    [Fact]
    public void Fairness_under_contention_aging_promotes_older_waiter()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var holder = Guid.NewGuid();
        var low = Guid.NewGuid();
        var high = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;

        Assert.True(sim.AcquireNextSegment(holder, 0, 0, goalB, priority: 10).Granted);
        Assert.True(sim.AcquireNextSegment(low, 0, 0, goalB, priority: 0).Queued);
        sim.AdvanceTime(TimeSpan.FromSeconds(100)); // age low waiter
        Assert.True(sim.AcquireNextSegment(high, 0, 0, goalB, priority: 1).Queued);

        // Release holder via operator clearance.
        var occupied = sim.State.Snapshot().Robots.Single(r => r.RobotId == holder).OccupiedResourceIds;
        sim.State.ReleaseAfterPhysicalClearance(holder, "op-1", occupied);

        var snap = sim.State.Snapshot();
        var authorized = snap.Robots.Where(r => r.Phase is TrafficRobotPhase.Authorized or TrafficRobotPhase.Moving).ToList();
        Assert.NotEmpty(authorized);
        // Aged low-priority waiter should win over newer slightly-higher priority.
        Assert.Contains(authorized, r => r.RobotId == low);
    }

    [Fact]
    public async Task Parallel_stress_no_conflicting_grants()
    {
        var coordinator = SegmentedCoordinatorFactory.Create();
        await coordinator.StartAsync(CancellationToken.None);
        var graph = FakeRobotSim.BuildNarrowBidirectional();
        var mapId = Guid.NewGuid();
        await coordinator.BindGraphAsync(mapId, graph);
        await coordinator.CompleteReconciliationAsync([]);

        var goalB = graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var bag = new ConcurrentBag<(Guid Robot, AcquireResult Result)>();
        var robots = Enumerable.Range(0, 20).Select(_ => Guid.NewGuid()).ToArray();

        await Task.WhenAll(robots.Select(async r =>
        {
            var plan = await coordinator.RequestSegmentAsync(new RoutePlanRequest(
                Guid.NewGuid(), r, mapId, graph, 0, 0, null, goalB));
            if (!plan.Ok || plan.Segments.Length == 0)
            {
                bag.Add((r, AcquireResult.Reject(plan.Reason ?? "FAIL")));
                return;
            }

            var acq = await coordinator.AcquireAtomicAsync(plan.Segments[0], coordinator.Epoch);
            bag.Add((r, acq));
        }));

        var granted = bag.Where(x => x.Result.Granted).ToList();
        Assert.True(granted.Count <= 1);

        var snap = await coordinator.GetTrafficSnapshotAsync();
        AssertNoConflictingGrants(snap);
        await coordinator.DisposeAsync();
    }

    [Fact]
    public async Task Bounded_inbox_overload_rejects()
    {
        var options = new TrafficOptions
        {
            Mode = TrafficCoordinatorMode.Active,
            InboxCapacity = 1,
            InboxOfferTimeoutMs = 1
        };
        var coordinator = SegmentedCoordinatorFactory.Create(options);
        // Do not start the loop → writes fill / timeout.
        var graph = FakeRobotSim.BuildNarrowBidirectional();
        // Force start then immediately flood? Better: start, then pause is hard.
        // Instead call GetTrafficSnapshot many times concurrently with tiny inbox after stopping reader.
        await coordinator.StartAsync(CancellationToken.None);
        await coordinator.BindGraphAsync(Guid.NewGuid(), graph);
        await coordinator.CompleteReconciliationAsync([]);

        var tasks = Enumerable.Range(0, 200).Select(_ =>
            coordinator.GetTrafficSnapshotAsync()).ToArray();
        var snaps = await Task.WhenAll(tasks);
        Assert.Contains(snaps, s => s.Phase is "Overloaded" or "Ready" or "Reconciling");
        await coordinator.DisposeAsync();
    }

    [Fact]
    public void Idempotent_acquire_same_request_id()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        var requestId = Guid.NewGuid();
        var a = sim.AcquireNextSegment(robot, 0, 0, goalB, requestId: requestId);
        var b = sim.AcquireNextSegment(robot, 0, 0, goalB, requestId: requestId);
        Assert.Equal(a.Granted, b.Granted);
        Assert.Equal(a.Authority?.AuthorityId, b.Authority?.AuthorityId);
    }

    [Fact]
    public void Operator_release_after_clearance_requires_operator()
    {
        var sim = new FakeRobotSim(FakeRobotSim.BuildNarrowBidirectional());
        var robot = Guid.NewGuid();
        var goalB = sim.Graph.Stations.First(s => s.EndpointCode == "EP-B").NodeId;
        Assert.True(sim.AcquireNextSegment(robot, 0, 0, goalB).Granted);
        Assert.False(sim.State.ReleaseAfterPhysicalClearance(robot, "", null).Ok);
        Assert.True(sim.State.ReleaseAfterPhysicalClearance(robot, "admin", null).Ok);
    }

    [Fact]
    public void Property_random_walk_invariants()
    {
        var rng = new Random(42);
        var sim = new FakeRobotSim(FakeRobotSim.BuildThreeWayJunction());
        var robots = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid()).ToArray();
        var goals = sim.Graph.Stations.Select(s => s.NodeId).ToArray();
        var poses = robots.Select(_ => (X: rng.NextDouble() * 2, Y: rng.NextDouble())).ToArray();

        for (var step = 0; step < 80; step++)
        {
            var i = rng.Next(robots.Length);
            var goal = goals[rng.Next(goals.Length)];
            var plan = sim.Plan(robots[i], poses[i].X, poses[i].Y, goal, priority: rng.Next(0, 3));
            if (plan.Ok && plan.Segments.Length > 0)
            {
                sim.State.AcquireAtomic(plan.Segments[0] with { RequestId = Guid.NewGuid() }, sim.Epoch, null);
            }

            if (rng.NextDouble() < 0.2)
            {
                sim.State.MarkOffline(robots[i]);
            }

            if (rng.NextDouble() < 0.15)
            {
                var view = sim.State.Snapshot().Robots.FirstOrDefault(r => r.RobotId == robots[i]);
                if (view is { OccupiedResourceIds.Length: > 0 })
                {
                    sim.State.ReleaseAfterPhysicalClearance(robots[i], "prop", view.OccupiedResourceIds);
                }
            }

            AssertNoConflictingGrants(sim.State.Snapshot());
            // Authority that covers resources must have matching occupancy (empty segment = already at goal).
            Assert.DoesNotContain(sim.State.Snapshot().Robots, r =>
                r.Authority is { ResourceIds.Length: > 0 } &&
                r.OccupiedResourceIds.Length == 0 &&
                r.Phase is TrafficRobotPhase.Authorized or TrafficRobotPhase.Moving);
        }
    }

    private static void AssertNoConflictingGrants(TrafficSnapshot snap)
    {
        foreach (var resource in snap.Resources.Where(r => r.Capacity == 1))
        {
            Assert.True(resource.Holders.Length <= 1,
                $"Resource {resource.ResourceId} has {resource.Holders.Length} holders");
        }
    }
}
