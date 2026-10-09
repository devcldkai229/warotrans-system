using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.ValueObjects;

public sealed class WorkflowVariableDefinition
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public WorkflowDataType DataType { get; set; }
    public WorkflowVariableSource Source { get; set; }
    public bool IsRequired { get; set; }
    public JsonElement? DefaultValue { get; set; }
    public JsonElement? ConfiguredValue { get; set; }
    public string? Description { get; set; }
    public int SequenceNo { get; set; }
}
