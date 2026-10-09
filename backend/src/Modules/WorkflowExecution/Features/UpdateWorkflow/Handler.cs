using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Features.UpdateWorkflow;

public sealed class UpdateWorkflowHandler(WorkflowExecutionDbContext db)
{
    public async Task<WorkflowDetailDto> HandleAsync(
        Guid id,
        UpdateWorkflowRequest request,
        CancellationToken cancellationToken)
    {
        var workflow = await db.Workflows
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Workflow '{id}' was not found.", "workflow_not_found");

        if (workflow.Status != WorkflowStatus.DRAFT)
        {
            throw new ConflictException(
                "Only DRAFT workflows can be updated. Create a new version instead.",
                "workflow_not_draft");
        }

        var model = WorkflowMapping.ToDefinitionModel(request);
        WorkflowMapping.ThrowIfInvalid(WorkflowDefinitionValidator.ValidateDraft(model));

        if (!string.Equals(workflow.Code, model.Code, StringComparison.Ordinal))
        {
            var conflict = await db.Workflows.AnyAsync(
                w => w.Code == model.Code && w.VersionNo == workflow.VersionNo && w.Id != workflow.Id,
                cancellationToken);
            if (conflict)
            {
                throw new ConflictException(
                    $"Workflow '{model.Code}' version {workflow.VersionNo} already exists.",
                    "workflow_version_exists");
            }
        }

        await db.WorkflowSteps
            .Where(s => s.WorkflowTask.WorkflowId == id)
            .ExecuteDeleteAsync(cancellationToken);
        await db.WorkflowTasks
            .Where(t => t.WorkflowId == id)
            .ExecuteDeleteAsync(cancellationToken);

        var rows = await db.Workflows
            .Where(w => w.Id == id && w.Status == WorkflowStatus.DRAFT)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(w => w.Code, model.Code)
                    .SetProperty(w => w.Name, model.Name)
                    .SetProperty(w => w.Description, model.Description),
                cancellationToken);

        if (rows == 0)
        {
            throw new ConflictException("Workflow was modified concurrently.", "workflow_conflict");
        }

        // VariablesSchema uses a value converter — update via tracked entity for JSONB.
        var tracked = await db.Workflows.FirstAsync(w => w.Id == id, cancellationToken);
        tracked.VariablesSchema = model.Variables;

        foreach (var taskModel in model.Tasks.OrderBy(t => t.SequenceNo))
        {
            var task = new WorkflowTask
            {
                Id = Guid.NewGuid(),
                WorkflowId = id,
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

            db.WorkflowTasks.Add(task);
        }

        await db.SaveChangesAsync(cancellationToken);

        var reloaded = await db.Workflows
            .AsNoTracking()
            .Include(w => w.Tasks)
            .ThenInclude(t => t.Steps)
            .FirstAsync(w => w.Id == id, cancellationToken);

        return WorkflowMapping.ToDetail(reloaded);
    }
}
