using Microsoft.EntityFrameworkCore;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Services;

/// <summary>Lets WorkflowExecution refuse to delete a Workflow version that TransportRequests still point at.</summary>
public sealed class WorkflowUsageQuery(TransportationDbContext db) : IWorkflowUsageQuery
{
    public Task<bool> IsUsedByTransportRequestAsync(Guid workflowId, CancellationToken cancellationToken = default) =>
        db.TransportRequests.AsNoTracking().AnyAsync(r => r.WorkflowId == workflowId, cancellationToken);
}
