using Microsoft.EntityFrameworkCore;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.ListWorkflows;

public sealed class ListWorkflowsHandler(WorkflowExecutionDbContext db)
{
    public async Task<object> HandleAsync(string? code, string? status, CancellationToken cancellationToken)
    {
        var query = db.Workflows.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(code))
        {
            query = query.Where(w => w.Code == code.Trim());
        }

        if (!string.IsNullOrWhiteSpace(status)
            && Enum.TryParse<WorkflowStatus>(status.Trim(), ignoreCase: true, out var parsed))
        {
            query = query.Where(w => w.Status == parsed);
        }

        var items = await query
            .OrderBy(w => w.Code)
            .ThenByDescending(w => w.VersionNo)
            .Select(w => new WorkflowListItemDto(
                w.Id,
                w.Code,
                w.VersionNo,
                w.Name,
                w.Description,
                w.Status,
                w.CreatedAt,
                w.PublishedAt))
            .ToListAsync(cancellationToken);

        return new { total = items.Count, items };
    }
}
