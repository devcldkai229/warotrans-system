namespace WaroTrans.WorkflowExecution.Enums;

/// <summary>
/// WAIT modes per rules/03 — DURATION | EVENT | ROBOT_STATE.
/// Optional timeoutSeconds is a binding input on EVENT / ROBOT_STATE, not a separate mode.
/// </summary>
public enum WaitMode
{
    DURATION,
    EVENT,
    ROBOT_STATE
}
