using System.Text.Json.Serialization;

namespace WaroTrans.WorkflowExecution.ValueObjects;

/// <summary>
/// Optional condition on a WorkflowTask that skips the task at provision time
/// when the referenced boolean workflow variable in Job.ContextValues does not match.
/// </summary>
public sealed class TaskRunCondition
{
    public string VariableKey { get; set; } = string.Empty;

    [JsonPropertyName("equals")]
    public bool EqualsValue { get; set; } = true;
}
