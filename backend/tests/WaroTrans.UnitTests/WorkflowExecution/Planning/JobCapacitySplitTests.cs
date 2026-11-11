using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Planning;

namespace WaroTrans.UnitTests.WorkflowExecution.Planning;

/// <summary>FL-03: a group of Containers becomes the trips the robots can carry.</summary>
public class JobCapacitySplitTests
{
    private static readonly Guid A = Guid.NewGuid();
    private static readonly Guid B = Guid.NewGuid();

    private static (TransportRequestExecutionSnapshot Request, List<Guid> Ids) Request(int containers)
    {
        var ids = Enumerable.Range(0, containers).Select(_ => Guid.NewGuid()).ToList();
        var details = ids.Select((id, i) => new TransportRequestDetailSnapshot(
            Guid.NewGuid(), i + 1, id, null, A, null, null, B, null)).ToList();
        return (new TransportRequestExecutionSnapshot(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), 1, new Dictionary<string, System.Text.Json.JsonElement>(), details), ids);
    }

    private static Dictionary<Guid, decimal> Weights(IReadOnlyList<Guid> ids, params decimal[] kg) =>
        ids.Zip(kg).ToDictionary(x => x.First, x => x.Second);

    [Fact]
    public void The_largest_robot_limits_the_trip_when_it_is_below_the_configured_limit()
    {
        var (request, _) = Request(5);

        var plan = new CollectThenDeliverJobBatchPlanner(10).Plan(request, new JobPlanLimits(2, null, new Dictionary<Guid, decimal>()));

        Assert.Equal([2, 2, 1], plan.Select(b => b.ContainerIds.Count));
    }

    [Fact]
    public void The_configured_limit_still_applies_when_robots_could_carry_more()
    {
        var (request, _) = Request(3);

        var plan = new CollectThenDeliverJobBatchPlanner(1).Plan(request, new JobPlanLimits(4, null, new Dictionary<Guid, decimal>()));

        Assert.Equal(3, plan.Count);
    }

    [Fact]
    public void Containers_split_when_together_they_are_too_heavy()
    {
        var (request, ids) = Request(4);

        var plan = new CollectThenDeliverJobBatchPlanner(10).Plan(request, new JobPlanLimits(null, 10m, Weights(ids, 6m, 3m, 5m, 5m)));

        Assert.Equal([ids[0], ids[1]], plan[0].ContainerIds);
        Assert.Equal([ids[2], ids[3]], plan[1].ContainerIds);
    }

    [Fact]
    public void Containers_that_fit_stay_together_and_every_one_is_planned_once()
    {
        var (request, ids) = Request(3);

        var together = new CollectThenDeliverJobBatchPlanner(10).Plan(request, new JobPlanLimits(3, 30m, Weights(ids, 5m, 5m, 5m)));
        Assert.Single(together);

        var apart = new CollectThenDeliverJobBatchPlanner(10).Plan(request, new JobPlanLimits(null, 4m, Weights(ids, 3m, 3m, 3m)));
        Assert.Equal(3, apart.Count);
        Assert.Equal(ids, apart.SelectMany(b => b.ContainerIds));
    }

    [Fact]
    public void With_nothing_declared_only_the_configured_limit_counts()
    {
        var (request, _) = Request(2);

        Assert.Single(new CollectThenDeliverJobBatchPlanner().Plan(request, new JobPlanLimits(null, null, new Dictionary<Guid, decimal>())));
        Assert.Equal(2, new CollectThenDeliverJobBatchPlanner(1).Plan(request).Count);
    }
}
