namespace WaroTrans.WorkflowExecution.Contracts;

public sealed record JobBatchPlan(
    string BatchKey,
    int SequenceNo,
    IReadOnlyList<Guid> ContainerIds,
    IReadOnlyList<JobStopPlan> Stops);
