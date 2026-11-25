using System.Collections.Immutable;
using WaroTrans.Fleet.Features.Lab;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// Fault Injection Lab, traffic side: the phantom reservation (TRA-01) holds a robot exactly like a reservation nobody
/// releases, and a robot on another map bundle (MAP-01) leaves evidence of both fingerprints.
/// </summary>
public class LabFaultTrafficTests
{
    private static SemanticTrafficPolicy Policy() =>
        new("fp-host", Guid.NewGuid(), "MAP-ONE-V021", CellSizeMeters: 0.1, HorizonMeters: 4.0,
            FootprintHalfLength: 0.18, FootprintHalfWidth: 0.15, [], []);

    private static SemanticPlanProposeRequest Propose(Guid robot, string fingerprint, long revision) =>
        new(Guid.NewGuid(), robot, "RBT-002", fingerprint, revision,
            ImmutableArray.Create(new SemanticPlanPose(0, 0, 0), new SemanticPlanPose(2, 0, 0)),
            null, null, null, CommandId: Guid.Empty);

    private static TrafficState Bound()
    {
        var state = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 64 });
        state.BeginEpoch(1);
        Assert.True(state.BindSemanticPolicy(Policy()).Ok);
        state.CompleteReconciliation([]);
        return state;
    }

    [Fact]
    public void Phantom_hold_blocks_a_plan_through_it_and_release_lets_it_pass()
    {
        var state = Bound();
        var robot = Guid.NewGuid();
        Assert.True(state.LabPhantomHold(1.0, 0.0, 0.3, hold: true).Ok);

        var held = state.AcquireSemanticPlan(Propose(robot, "fp-host", 1));
        Assert.False(held.Granted);
        Assert.Contains(state.Snapshot().Decisions, d => d.Kind == "lab" && d.Code == "lab-phantom-hold");

        Assert.True(state.LabPhantomHold(1.0, 0.0, 0.3, hold: false).Ok);
        Assert.True(state.AcquireSemanticPlan(Propose(robot, "fp-host", 2)).Granted);
    }

    [Fact]
    public void Phantom_hold_needs_a_bound_map()
    {
        var state = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic });
        Assert.Equal("SEMANTIC_POLICY_UNBOUND", state.LabPhantomHold(0, 0, 0.3, true).Reason);
    }

    [Fact]
    public void Wrong_fingerprint_is_refused_with_both_bundles_as_evidence()
    {
        var state = Bound();
        var robot = Guid.NewGuid();
        var result = state.AcquireSemanticPlan(Propose(robot, "lab-wrong-bundle", 1));
        Assert.Equal("FINGERPRINT_MISMATCH", result.Reason);
        var decision = Assert.Single(state.Snapshot().Decisions, d => d.Code == "semantic-reject-fingerprint");
        Assert.Equal(("plan-rejected", "ERROR", robot), (decision.Kind, decision.Severity, decision.RobotId));
        Assert.Equal("robot=lab-wrong-bundle host=fp-host", decision.Detail);
    }

    [Fact]
    public void Catalog_ids_are_unique_and_robot_faults_end_by_themselves()
    {
        Assert.Equal(LabCatalog.All.Count, LabCatalog.All.Select(s => s.Id).Distinct().Count());
        Assert.All(LabCatalog.All, s => Assert.InRange(s.DefaultTtlSeconds, 1, LabInjectionService.MaxTtlSeconds));
        Assert.All(LabCatalog.All, s => Assert.NotEmpty(s.Expected));
        Assert.Equal("TRA-01", LabCatalog.Find("tra-01")!.Id);
    }
}
