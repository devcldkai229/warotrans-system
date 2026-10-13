using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Validation;

namespace WaroTrans.WorkflowExecution.Features.PublishWorkflow;

public sealed class PublishWorkflowHandler(WorkflowExecutionDbContext db)
{
    public async Task<WorkflowDetailDto> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var workflow = await db.Workflows
            .Include(w => w.Tasks)
            .ThenInclude(t => t.Steps)
            .FirstOrDefaultAsync(w => w.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Workflow '{id}' was not found.", "workflow_not_found");

        if (workflow.Status != WorkflowStatus.DRAFT)
        {
            throw new ConflictException("Only DRAFT workflows can be published.", "workflow_not_draft");
        }

        var model = WorkflowMapping.ToDefinitionModel(workflow);
        WorkflowMapping.ThrowIfInvalid(WorkflowDefinitionValidator.ValidateForPublish(model));

        workflow.Status = WorkflowStatus.PUBLISHED;
        workflow.PublishedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return WorkflowMapping.ToDetail(workflow);
    }
}
