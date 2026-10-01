namespace WaroTrans.WorkflowExecution.Enums;

public enum JobStatus
{
    CREATED,
    QUEUED,
    ASSIGNED,
    RUNNING,
    PAUSED,
    REASSIGNING,
    RECOVERY_REQUIRED,
    COMPLETED,
    FAILED,
    CANCELLED
}
