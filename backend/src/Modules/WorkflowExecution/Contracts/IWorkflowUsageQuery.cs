namespace WaroTrans.WorkflowExecution.Contracts;

/// <summary>
/// Tells whether a Workflow version is still used outside WorkflowExecution. Implemented by Transportation (which owns
/// TransportRequest). Declared here because Transportation already depends on WorkflowExecution contracts, so
/// WorkflowExecution must not reference Transportation.
/// </summary>
public interface IWorkflowUsageQuery
{
    /// <summary>True when at least one TransportRequest was created from this Workflow version.</summary>
    Task<bool> IsUsedByTransportRequestAsync(Guid workflowId, CancellationToken cancellationToken = default);
}
