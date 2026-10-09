using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Validation;

public sealed class WorkflowDefinitionModel
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<WorkflowVariableDefinition> Variables { get; set; } = [];
    public List<WorkflowTaskModel> Tasks { get; set; } = [];
}

public sealed class WorkflowTaskModel
{
    public string TaskKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SequenceNo { get; set; }
    public List<WorkflowStepModel> Steps { get; set; } = [];
}

public sealed class WorkflowStepModel
{
    public string StepKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public StepType StepType { get; set; }
    public int SequenceNo { get; set; }
    public string OperationCode { get; set; } = string.Empty;
    public string? InstructionText { get; set; }
    public Dictionary<string, StepInputBinding> InputBindings { get; set; } = new();
    public int TimeoutSeconds { get; set; }
    public int MaxAttempts { get; set; } = 1;
    public int RetryBackoffSeconds { get; set; }
    public StepFailurePolicy OnFailure { get; set; } = StepFailurePolicy.FAIL_JOB;
}
