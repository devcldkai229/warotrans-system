namespace WaroTrans.WorkflowExecution.Contracts;

public interface IJobRuntimeProvisioner
{
    Task<ProvisionJobRuntimeResult> ProvisionAsync(
        TransportRequestExecutionSnapshot request,
        IReadOnlyList<JobBatchPlan> batches,
        CancellationToken cancellationToken = default);
}