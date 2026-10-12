namespace WaroTrans.WorkflowExecution.Contracts;

public sealed record JobStopPlan(
    int SequenceNo,
    Guid EndpointId,
    JobStopAction Action,
    IReadOnlyList<Guid> ContainerIds);
