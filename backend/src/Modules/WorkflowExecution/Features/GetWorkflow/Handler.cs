using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.WorkflowExecution.Features.WorkflowVisibility;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.GetWorkflow;

public sealed class GetWorkflowHandler(WorkflowExecutionDbContext db, ICurrentUser? currentUser = null)
{
    public async Task<WorkflowDetailDto> HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var workflow = await db.Workflows
            .AsNoTracking()
            .Include(w => w.Tasks)
            .ThenInclude(t => t.Steps)
            .FirstOrDefaultAsync(w => w.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Workflow '{id}' was not found.", "workflow_not_found");

        StaffWorkflowVisibility.EnsureVisible(workflow, currentUser);
        return WorkflowMapping.ToDetail(workflow);
    }
}
