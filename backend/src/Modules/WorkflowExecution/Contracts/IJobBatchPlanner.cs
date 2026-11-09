namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// Job Planning: decides which Containers form one Job batch, which Stops the Job visits,
/// stop order and which Containers belong to each Stop.
/// Does not create Job runtime entities, assign Robots or plan navigation routes.
/// </summary>
/// <summary>
/// FL-03: what no Job may go over, from the robots that could run it. The robot is chosen later, so this is the most the
/// largest robot can carry; dispatch then refuses a smaller one. Null = nothing known.
/// </summary>
public sealed record JobPlanLimits(int? MaxContainers, decimal? MaxPayloadKg, IReadOnlyDictionary<Guid, decimal> WeightsKg);

/// <summary>FL-03: looks up the limits for a request. Refuses a Container no robot on the map could ever carry.</summary>
public interface IJobPlanLimitsQuery
{
    Task<JobPlanLimits> GetAsync(TransportRequestExecutionSnapshot request, CancellationToken cancellationToken = default);
}

public interface IJobBatchPlanner
{
    IReadOnlyList<JobBatchPlan> Plan(TransportRequestExecutionSnapshot request, JobPlanLimits? limits = null);
}
