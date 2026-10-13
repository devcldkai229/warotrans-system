namespace WaroTrans.WorkflowExecution.Runtime;

/// <summary>
/// Runtime values available to SYSTEM_VALUE resolution when a Job executes.
/// </summary>
public sealed class WorkflowRuntimeContext
{
    public Guid? JobId { get; init; }
    public Guid? AssignedRobotId { get; init; }
    public Guid? TransportRequestId { get; init; }
    public Guid? CurrentUserId { get; init; }
}
