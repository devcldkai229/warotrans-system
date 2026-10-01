namespace WaroTrans.WorkflowExecution.ValueObjects;

public class WorkflowVariableDefinition
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public bool Required { get; set; }
    public string? DefaultValue { get; set; }
    public string? Value { get; set; }
    public string? Description { get; set; }
}
