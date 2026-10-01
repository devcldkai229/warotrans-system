using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class WorkflowStep
{
    public Guid Id { get; set; }
    public Guid WorkflowTaskId { get; set; }
    public string StepKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public StepType StepType { get; set; }
    public int SequenceNo { get; set; }
    public Dictionary<string, JsonElement> InputBindings { get; set; } = new();
    public int TimeoutSeconds { get; set; }
    public int MaxAttempts { get; set; }
    public int RetryBackoffSeconds { get; set; }
    public StepFailurePolicy OnFailure { get; set; }

    public WorkflowTask WorkflowTask { get; set; } = null!;
}
