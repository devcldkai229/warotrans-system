namespace WaroTrans.WorkflowExecution.Contracts;

public interface IWorkflowRequestValidator
{
    Task ValidateAsync(
        Guid workflowId,
        TransportRequestExecutionSnapshot request,
        CancellationToken cancellationToken = default);
}
