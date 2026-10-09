namespace WaroTrans.WorkflowExecution.ValueObjects;

/// <summary>
/// Step-type-specific config: conditionCode / purpose / actionCode / waitMode.
/// </summary>
public sealed class WorkflowStepConfig
{
    public string OperationCode { get; set; } = string.Empty;
    public string? InstructionText { get; set; }
}
