namespace WaroTrans.WorkflowExecution.Enums;

public enum StepFailurePolicy
{
    FAIL_JOB,
    PAUSE_FOR_OPERATOR,
    REQUEST_REASSIGN
}
