using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class WorkflowStep
{
    public Guid Id { get; set; }
    public Guid WorkflowTaskId { get; set; }
    public string StepKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public StepType StepType { get; set; }
    public int SequenceNo { get; set; }
    public WorkflowStepConfig Config { get; set; } = new();
    public Dictionary<string, StepInputBinding> InputBindings { get; set; } = new();
    public int TimeoutSeconds { get; set; }
    public int MaxAttempts { get; set; } = 1;
    public int RetryBackoffSeconds { get; set; }
    public StepFailurePolicy OnFailure { get; set; } = StepFailurePolicy.FAIL_JOB;

    public WorkflowTask WorkflowTask { get; set; } = null!;
}
