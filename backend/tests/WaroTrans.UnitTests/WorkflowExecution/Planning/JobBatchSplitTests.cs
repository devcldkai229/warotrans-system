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
    public void No_limit_keeps_one_batch_as_before()
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
    public void Same_route_stays_together_up_to_the_limit()
    {
        var request = Request((A, D), (B, E), (A, D), (A, D));

        var plan = new CollectThenDeliverJobBatchPlanner(2).Plan(request);

        Assert.Equal(3, plan.Count);
        Assert.Equal([request.Details[0].ContainerId, request.Details[2].ContainerId], plan[0].ContainerIds);
        Assert.Equal([request.Details[3].ContainerId], plan[1].ContainerIds);
        Assert.Equal([request.Details[1].ContainerId], plan[2].ContainerIds);
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
