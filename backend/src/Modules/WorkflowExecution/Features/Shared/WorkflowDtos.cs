using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Features.Shared;

public sealed record WorkflowListItemDto(
    Guid Id,
    string Code,
    int VersionNo,
    string Name,
    string? Description,
    WorkflowStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt);

public sealed record WorkflowDetailDto(
    Guid Id,
    string Code,
    int VersionNo,
    string Name,
    string? Description,
    WorkflowStatus Status,
    Guid CreatedBy,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt,
    IReadOnlyList<WorkflowVariableDefinition> Variables,
    IReadOnlyList<WorkflowTaskDto> Tasks);

public sealed record WorkflowTaskDto(
    Guid Id,
    string TaskKey,
    string Name,
    int SequenceNo,
    IReadOnlyList<WorkflowStepDto> Steps);

public sealed record WorkflowStepDto(
    Guid Id,
    string StepKey,
    string Name,
    StepType StepType,
    int SequenceNo,
    string OperationCode,
    string? InstructionText,
    Dictionary<string, StepInputBinding> InputBindings,
    int TimeoutSeconds,
    int MaxAttempts,
    int RetryBackoffSeconds,
    StepFailurePolicy OnFailure);

public class UpsertWorkflowRequest
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<WorkflowVariableDefinition> Variables { get; set; } = [];
    public List<UpsertWorkflowTaskRequest> Tasks { get; set; } = [];
}

public sealed class UpsertWorkflowTaskRequest
{
    public string TaskKey { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SequenceNo { get; set; }
    public List<UpsertWorkflowStepRequest> Steps { get; set; } = [];
}

public sealed class UpsertWorkflowStepRequest
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

public static class WorkflowMapping
{
    public static WorkflowDefinitionModel ToDefinitionModel(UpsertWorkflowRequest request) =>
        new()
        {
            Code = request.Code.Trim(),
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Variables = request.Variables,
            Tasks = request.Tasks.Select(t => new WorkflowTaskModel
            {
                TaskKey = t.TaskKey.Trim(),
                Name = t.Name.Trim(),
                SequenceNo = t.SequenceNo,
                Steps = t.Steps.Select(s => new WorkflowStepModel
                {
                    StepKey = s.StepKey.Trim(),
                    Name = s.Name.Trim(),
                    StepType = s.StepType,
                    SequenceNo = s.SequenceNo,
                    OperationCode = s.OperationCode.Trim(),
                    InstructionText = string.IsNullOrWhiteSpace(s.InstructionText) ? null : s.InstructionText.Trim(),
                    InputBindings = s.InputBindings,
                    TimeoutSeconds = s.TimeoutSeconds,
                    MaxAttempts = s.MaxAttempts <= 0 ? 1 : s.MaxAttempts,
                    RetryBackoffSeconds = s.RetryBackoffSeconds,
                    OnFailure = s.OnFailure
                }).ToList()
            }).ToList()
        };

    public static WorkflowDefinitionModel ToDefinitionModel(Workflow workflow) =>
        new()
        {
            Code = workflow.Code,
            Name = workflow.Name,
            Description = workflow.Description,
            Variables = workflow.VariablesSchema,
            Tasks = workflow.Tasks
                .OrderBy(t => t.SequenceNo)
                .Select(t => new WorkflowTaskModel
                {
                    TaskKey = t.TaskKey,
                    Name = t.Name,
                    SequenceNo = t.SequenceNo,
                    Steps = t.Steps
                        .OrderBy(s => s.SequenceNo)
                        .Select(s => new WorkflowStepModel
                        {
                            StepKey = s.StepKey,
                            Name = s.Name,
                            StepType = s.StepType,
                            SequenceNo = s.SequenceNo,
                            OperationCode = s.Config.OperationCode,
                            InstructionText = s.Config.InstructionText,
                            InputBindings = s.InputBindings,
                            TimeoutSeconds = s.TimeoutSeconds,
                            MaxAttempts = s.MaxAttempts,
                            RetryBackoffSeconds = s.RetryBackoffSeconds,
                            OnFailure = s.OnFailure
                        }).ToList()
                }).ToList()
        };

    public static void ApplyDefinition(Workflow workflow, WorkflowDefinitionModel model)
    {
        workflow.Code = model.Code;
        workflow.Name = model.Name;
        workflow.Description = model.Description;
        workflow.VariablesSchema = model.Variables;

        workflow.Tasks.Clear();
        foreach (var taskModel in model.Tasks.OrderBy(t => t.SequenceNo))
        {
            var task = new WorkflowTask
            {
                Id = Guid.NewGuid(),
                WorkflowId = workflow.Id,
                TaskKey = taskModel.TaskKey,
                Name = taskModel.Name,
                SequenceNo = taskModel.SequenceNo
            };

            foreach (var stepModel in taskModel.Steps.OrderBy(s => s.SequenceNo))
            {
                task.Steps.Add(new WorkflowStep
                {
                    Id = Guid.NewGuid(),
                    WorkflowTaskId = task.Id,
                    StepKey = stepModel.StepKey,
                    Name = stepModel.Name,
                    StepType = stepModel.StepType,
                    SequenceNo = stepModel.SequenceNo,
                    Config = new WorkflowStepConfig
                    {
                        OperationCode = stepModel.OperationCode,
                        InstructionText = stepModel.InstructionText
                    },
                    InputBindings = stepModel.InputBindings,
                    TimeoutSeconds = stepModel.TimeoutSeconds,
                    MaxAttempts = stepModel.MaxAttempts,
                    RetryBackoffSeconds = stepModel.RetryBackoffSeconds,
                    OnFailure = stepModel.OnFailure
                });
            }

            workflow.Tasks.Add(task);
        }
    }

    public static WorkflowDetailDto ToDetail(Workflow workflow) =>
        new(
            workflow.Id,
            workflow.Code,
            workflow.VersionNo,
            workflow.Name,
            workflow.Description,
            workflow.Status,
            workflow.CreatedBy,
            workflow.CreatedAt,
            workflow.PublishedAt,
            workflow.VariablesSchema,
            workflow.Tasks
                .OrderBy(t => t.SequenceNo)
                .Select(t => new WorkflowTaskDto(
                    t.Id,
                    t.TaskKey,
                    t.Name,
                    t.SequenceNo,
                    t.Steps
                        .OrderBy(s => s.SequenceNo)
                        .Select(s => new WorkflowStepDto(
                            s.Id,
                            s.StepKey,
                            s.Name,
                            s.StepType,
                            s.SequenceNo,
                            s.Config.OperationCode,
                            s.Config.InstructionText,
                            s.InputBindings,
                            s.TimeoutSeconds,
                            s.MaxAttempts,
                            s.RetryBackoffSeconds,
                            s.OnFailure))
                        .ToList()))
                .ToList());

    public static WorkflowListItemDto ToListItem(Workflow workflow) =>
        new(
            workflow.Id,
            workflow.Code,
            workflow.VersionNo,
            workflow.Name,
            workflow.Description,
            workflow.Status,
            workflow.CreatedAt,
            workflow.PublishedAt);

    public static void ThrowIfInvalid(WorkflowDefinitionValidationResult result)
    {
        if (result.IsValid)
        {
            return;
        }

        var failures = result.Errors
            .Select(e => new FluentValidation.Results.ValidationFailure(e.Path, e.Message))
            .ToList();
        throw new FluentValidation.ValidationException(failures);
    }
}
