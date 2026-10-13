namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// Job Planning: decides which Containers form one Job batch, which Stops the Job visits,
/// stop order and which Containers belong to each Stop.
/// Does not create Job runtime entities, assign Robots or plan navigation routes.
/// </summary>
public interface IJobBatchPlanner
{
    IReadOnlyList<JobBatchPlan> Plan(TransportRequestExecutionSnapshot request);
}
