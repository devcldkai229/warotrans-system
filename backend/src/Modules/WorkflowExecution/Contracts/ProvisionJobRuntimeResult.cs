namespace WaroTrans.WorkflowExecution.Contracts;

public sealed record ProvisionedJobSummary(
    Guid JobId,
    string JobNo,
    string BatchKey,
    int JobContainerCount,
    int JobTaskCount,
    int JobStepCount);

public sealed record ProvisionJobRuntimeResult(
    Guid TransportRequestId,
    IReadOnlyList<ProvisionedJobSummary> Jobs);
