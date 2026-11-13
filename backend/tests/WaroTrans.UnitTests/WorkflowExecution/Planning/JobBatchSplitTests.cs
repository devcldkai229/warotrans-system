using System.Text.Json;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Planning;

namespace WaroTrans.UnitTests.WorkflowExecution.Planning;

/// <summary>WH-08: one request, N batches, every Container in exactly one of them, and the same plan every time.</summary>
public sealed class JobBatchSplitTests
{
    private static readonly Guid A = Guid.NewGuid(), B = Guid.NewGuid(), D = Guid.NewGuid(), E = Guid.NewGuid();

    private static TransportRequestExecutionSnapshot Request(params (Guid Source, Guid Destination)[] moves) =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            1,
            new Dictionary<string, JsonElement>(),
            moves.Select((m, i) => new TransportRequestDetailSnapshot(
                Guid.NewGuid(), i + 1, Guid.NewGuid(), null, m.Source, null, null, m.Destination, null)).ToList());

    [Fact]
    public void Within_the_robot_hard_cap_one_batch_as_before()
    {
        var plan = new CollectThenDeliverJobBatchPlanner().Plan(Request((A, D), (B, E), (A, D)));

        var batch = Assert.Single(plan);
        Assert.Equal(CollectThenDeliverJobBatchPlanner.SingleBatchKey, batch.BatchKey);
        Assert.Equal(3, batch.ContainerIds.Count);
    }

    [Fact]
    public void A_limit_of_one_gives_each_container_its_own_batch_in_order()
    {
        var request = Request((A, D), (A, D), (B, E));

        var plan = new CollectThenDeliverJobBatchPlanner(1).Plan(request);

        Assert.Equal(["BATCH-001", "BATCH-002", "BATCH-003"], plan.Select(b => b.BatchKey));
        Assert.Equal([1, 2, 3], plan.Select(b => b.SequenceNo));
        Assert.Equal(request.Details.Select(d => d.ContainerId), plan.Select(b => Assert.Single(b.ContainerIds)));
        Assert.All(plan, b => Assert.Equal(2, b.Stops.Count));
        Assert.Equal(B, plan[2].Stops[0].EndpointId);
        Assert.Equal(E, plan[2].Stops[1].EndpointId);
    }

    [Fact]
    public void Trips_fill_up_to_the_limit_and_mix_routes()
    {
        var request = Request((A, D), (B, E), (A, D), (A, D));

        var plan = new CollectThenDeliverJobBatchPlanner(2).Plan(request);

        // Pickup stop order first (A, then B), then dropoff stop order, then Detail order.
        Assert.Equal(2, plan.Count);
        Assert.Equal([request.Details[0].ContainerId, request.Details[2].ContainerId], plan[0].ContainerIds);
        Assert.Equal([request.Details[3].ContainerId, request.Details[1].ContainerId], plan[1].ContainerIds);
        // A trip with two routes collects at both sources before it delivers.
        Assert.Equal(
            [(A, JobStopAction.PICKUP), (B, JobStopAction.PICKUP), (D, JobStopAction.DROPOFF), (E, JobStopAction.DROPOFF)],
            plan[1].Stops.Select(s => (s.EndpointId, s.Action)));
    }

    [Fact]
    public void Inbound_takes_up_to_three_at_the_pickup_point_and_delivers_them_to_several_shelves()
    {
        Guid inbound = Guid.NewGuid(), s1 = Guid.NewGuid(), s2 = Guid.NewGuid(), s3 = Guid.NewGuid();
        var request = Request((inbound, s1), (inbound, s2), (inbound, s3), (inbound, s1), (inbound, s2));

        var plan = new CollectThenDeliverJobBatchPlanner().Plan(request);

        Assert.Equal([3, 2], plan.Select(b => b.ContainerIds.Count));
        var first = plan[0];
        Assert.Equal(JobStopAction.PICKUP, first.Stops[0].Action);
        Assert.Equal(inbound, first.Stops[0].EndpointId);
        Assert.Equal(3, first.Stops[0].ContainerIds.Count);
        Assert.Equal([s1, s2], first.Stops.Skip(1).Select(s => s.EndpointId));
        // Containers bound for the same shelf travel together.
        Assert.Equal(2, first.Stops[1].ContainerIds.Count);
        Assert.Equal([inbound, s2, s3], plan[1].Stops.Select(s => s.EndpointId));
    }

    [Fact]
    public void Outbound_collects_from_up_to_three_shelves_then_delivers_once()
    {
        Guid outbound = Guid.NewGuid(), s1 = Guid.NewGuid(), s2 = Guid.NewGuid(), s3 = Guid.NewGuid(), s4 = Guid.NewGuid();
        var request = Request((s1, outbound), (s2, outbound), (s3, outbound), (s4, outbound));

        var plan = new CollectThenDeliverJobBatchPlanner().Plan(request);

        Assert.Equal([3, 1], plan.Select(b => b.ContainerIds.Count));
        Assert.Equal(
            [(s1, JobStopAction.PICKUP), (s2, JobStopAction.PICKUP), (s3, JobStopAction.PICKUP), (outbound, JobStopAction.DROPOFF)],
            plan[0].Stops.Select(s => (s.EndpointId, s.Action)));
    }

    [Fact]
    public void A_configured_limit_above_the_robot_hard_cap_is_capped()
    {
        var request = Request((A, D), (A, D), (A, D), (A, D));

        var plan = new CollectThenDeliverJobBatchPlanner(10).Plan(request);

        Assert.Equal([JobPlanningOptions.HardMaxContainersPerRobot, 1], plan.Select(b => b.ContainerIds.Count));
    }

    [Fact]
    public void Planning_twice_gives_the_same_keys_and_containers()
    {
        var request = Request((A, D), (B, E), (A, D));
        var planner = new CollectThenDeliverJobBatchPlanner(1);

        var first = planner.Plan(request);
        var second = planner.Plan(request);

        Assert.Equal(first.Select(b => (b.BatchKey, b.ContainerIds[0])), second.Select(b => (b.BatchKey, b.ContainerIds[0])));
    }

    [Fact]
    public void Within_the_limit_there_is_one_batch()
    {
        var plan = new CollectThenDeliverJobBatchPlanner(5).Plan(Request((A, D), (B, E)));

        Assert.Equal(CollectThenDeliverJobBatchPlanner.SingleBatchKey, Assert.Single(plan).BatchKey);
    }
}
