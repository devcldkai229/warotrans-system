using Microsoft.Extensions.Time.Testing;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// The coordinator's decisions (grant, refusal, quarantine, retreat) reach the Evidence Recorder: before, they lived
/// only in an in-memory log line and the AI investigation could not see why a robot stood still.
/// </summary>
public class TrafficDecisionTests
{
    [Theory]
    [InlineData("deadlock-reject-semantic", "plan-rejected", "WARNING")]
    [InlineData("deadlock-reject", "plan-rejected", "WARNING")]
    [InlineData("grant-semantic", "plan-granted", "INFO")]
    [InlineData("quarantine", "quarantined", "ERROR")]
    [InlineData("deadlock-retreat", "deadlock-retreat", "WARNING")]
    public void Classifies_coordinator_codes_and_reads_the_robot(string code, string kind, string severity)
    {
        var robot = Guid.NewGuid();
        Assert.True(TrafficDecisionClassifier.TryClassify($"{code}:{robot}:why", out var d));
        Assert.Equal((code, kind, severity, robot, "why"), (d.Code, d.Kind, d.Severity, d.RobotId, d.Detail));
    }

    [Theory]
    [InlineData("renew")]
    [InlineData("extend")]
    [InlineData("wait")]
    [InlineData("follow-idle-pose")]
    public void Per_tick_lines_are_not_decisions(string code) =>
        Assert.False(TrafficDecisionClassifier.TryClassify($"{code}:{Guid.NewGuid()}:x", out _));

    [Fact]
    public void Snapshot_carries_decisions_in_order_with_growing_numbers()
    {
        var state = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 16 },
            new FakeTimeProvider());
        var a = Guid.NewGuid();
        state.RecordDecision(a, "goal-wait", "goal=EP-INBOUND");
        state.RecordDecision(a, "deadlock-retreat", "to=EP-QUEUE-B");

        var decisions = state.Snapshot().Decisions;
        Assert.Equal(["goal-wait", "deadlock-retreat"], decisions.Select(d => d.Kind));
        Assert.True(decisions[1].Seq > decisions[0].Seq);
        Assert.All(decisions, d => Assert.Equal(a, d.RobotId));
    }

    [Fact]
    public void The_decision_buffer_is_bounded()
    {
        var state = new TrafficState(new TrafficOptions { Mode = TrafficCoordinatorMode.Semantic, EventLogCapacity = 16 },
            new FakeTimeProvider());
        for (var i = 0; i < 40; i++)
        {
            state.RecordDecision(Guid.NewGuid(), "goal-wait", $"n={i}");
        }

        var decisions = state.Snapshot().Decisions;
        Assert.Equal(16, decisions.Length);
        Assert.Equal(40, decisions[^1].Seq);
    }
}
