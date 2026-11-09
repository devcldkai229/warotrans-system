using Microsoft.EntityFrameworkCore;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

public sealed class RobotWorkQuery(WorkflowExecutionDbContext db) : IRobotWorkQuery
{
    public Task<bool> HasActiveJobAsync(Guid robotId, CancellationToken cancellationToken = default) =>
        db.JobRobotAssignments.AsNoTracking().AnyAsync(a => a.RobotId == robotId && a.EndedAt == null, cancellationToken);
}
