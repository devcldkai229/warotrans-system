using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.WorkflowExecution.Registry;

/// <summary>
/// How Job Runtime Provisioner expands a WorkflowStep. Not persisted on WorkflowStep.
/// Do not infer from TaskKey/StepKey strings.
/// </summary>
public enum ExecutionScope
{
    ONCE_PER_JOB,
    ONCE_PER_STOP,
    PER_CONTAINER_AT_STOP
}

public sealed record OperationExecutionScopeDefinition(
    ExecutionScope Scope,
    /// <summary>
    /// When set, expand only stops with this action. Null + ONCE_PER_STOP means inherit WorkflowTask affinity.
    /// </summary>
    JobStopAction? StopActionFilter);
