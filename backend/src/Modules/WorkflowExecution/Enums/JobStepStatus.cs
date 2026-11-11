namespace WaroTrans.WorkflowExecution.Enums;

public enum JobStepStatus
{
    PENDING,
    READY,
    EXECUTING,
    WAITING,
    PAUSED,
    COMPLETED,
    FAILED,
    CANCELLED,

    /// <summary>Not needed any more: it only served a Container that failed on its own (WH-10).</summary>
    SKIPPED
}
