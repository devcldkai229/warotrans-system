using WaroTrans.WorkflowExecution.Features.RobotCare;

namespace WaroTrans.UnitTests.WorkflowExecution;

/// <summary>
/// Lab 2026-11-24 (MAP-ONE-V017): two INBOUND trips at once; the second robot must wait at the queue point of INBOUND
/// (outside the dead-end bay), not wander to free floor. The goal → queue pairs come from FleetIdle:GoalQueueEndpoints.
/// </summary>
public class GoalQueueOptionsTests
{
    [Fact]
    public void Reads_goal_queue_pairs_case_insensitively()
    {
        var o = new FleetIdleOptions { GoalQueueEndpoints = " EP-INBOUND = EP-QUEUE-B , EP-OUTBOUND=EP-QUEUE-C" };
        var map = o.GoalQueues();
        Assert.Equal("EP-QUEUE-B", map["ep-inbound"]);
        Assert.Equal("EP-QUEUE-C", map["EP-OUTBOUND"]);
    }

    [Theory]
    [InlineData("")]
    [InlineData("EP-INBOUND")]
    [InlineData("=EP-QUEUE-B,EP-INBOUND=")]
    public void Ignores_empty_or_broken_pairs(string raw) =>
        Assert.Empty(new FleetIdleOptions { GoalQueueEndpoints = raw }.GoalQueues());

    [Fact]
    public void The_first_pair_for_a_goal_wins() =>
        Assert.Equal("EP-QUEUE-B",
            new FleetIdleOptions { GoalQueueEndpoints = "EP-INBOUND=EP-QUEUE-B,EP-INBOUND=EP-QUEUE-A" }.GoalQueues()["EP-INBOUND"]);
}

/// <summary>Lab 2026-11-24: the INBOUND bay and its strip are taken in turn (FleetIdle:GoalCorridors).</summary>
public class GoalCorridorOptionsTests
{
    [Fact]
    public void Reads_boxes_with_invariant_numbers()
    {
        var c = new FleetIdleOptions { GoalCorridors = "EP-INBOUND=1.10,-1.15,2.65,1.60; EP-OUTBOUND = 1.6,-1.9,2.7,-1.1" }.Corridors();
        Assert.Equal((1.10, -1.15, 2.65, 1.60), c["ep-inbound"]);
        Assert.Equal((1.6, -1.9, 2.7, -1.1), c["EP-OUTBOUND"]);
    }

    [Theory]
    [InlineData("EP-INBOUND=1,2,3")]
    [InlineData("EP-INBOUND=2,0,1,1")]
    [InlineData("EP-INBOUND=a,b,c,d")]
    [InlineData("=1,2,3,4")]
    public void Ignores_malformed_boxes(string raw) =>
        Assert.Empty(new FleetIdleOptions { GoalCorridors = raw }.Corridors());
}
