namespace WaroTrans.WorkflowExecution.Contracts;

public interface IJobRuntimeProvisioner
{
    Task<ProvisionJobRuntimeResult> ProvisionAsync(
        TransportRequestExecutionSnapshot request,
        IReadOnlyList<JobBatchPlan> batches,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// FL-08 / WH-06: a Job that looks after a robot and carries nothing, so it has no TransportRequest behind it (a request
    /// needs at least one Container). Every step of the workflow must run once per Job. Same key: same Job.
    /// </summary>
    Task<Guid> ProvisionRobotJobAsync(RobotJobRequest request, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();
}

public sealed record RobotJobRequest(
    Guid WarehouseId,
    Guid MapVersionId,
    Guid WorkflowId,
    string ProvisioningKey,
    IReadOnlyDictionary<string, System.Text.Json.JsonElement> Inputs);