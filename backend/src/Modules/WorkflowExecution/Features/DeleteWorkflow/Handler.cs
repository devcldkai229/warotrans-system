using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.DeleteWorkflow;

public sealed class DeleteWorkflowHandler(WorkflowExecutionDbContext db, IWorkflowUsageQuery usage)
{
    /// <summary>
    /// Deletes one Workflow version with its tasks and steps. A version that a Job or a TransportRequest was created
    /// from stays, because they keep pointing at its id and would lose the template they ran.
    /// </summary>
    public async Task HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var workflow = await db.Workflows
            .AsNoTracking()
            .Where(w => w.Id == id)
            .Select(w => new { w.Code, w.VersionNo })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"Workflow '{id}' was not found.", "workflow_not_found");

        var usedByJob = await db.Jobs.AsNoTracking().AnyAsync(j => j.WorkflowId == id, cancellationToken);
        if (usedByJob || await usage.IsUsedByTransportRequestAsync(id, cancellationToken))
        {
            throw new ConflictException(
                $"Workflow '{workflow.Code}' version {workflow.VersionNo} is used by transport requests or jobs and cannot be deleted.",
                "workflow_in_use");
        }

        await db.WorkflowSteps
            .Where(s => s.WorkflowTask.WorkflowId == id)
            .ExecuteDeleteAsync(cancellationToken);
        await db.WorkflowTasks
            .Where(t => t.WorkflowId == id)
            .ExecuteDeleteAsync(cancellationToken);
        await db.Workflows
            .Where(w => w.Id == id)
            .ExecuteDeleteAsync(cancellationToken);
    }
}
