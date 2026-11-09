using Microsoft.EntityFrameworkCore;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

public sealed class RobotWorkQuery(WorkflowExecutionDbContext db) : IRobotWorkQuery
{
    /// <summary>
    /// A Job in RECOVERY_REQUIRED does not count: its robot has failed, and if it stands on the only way to the safe endpoint
    /// the second robot can never arrive. Someone moves it by hand and says so; otherwise recovery would be stuck for good.
    /// </summary>
    public Task<bool> HasActiveJobAsync(Guid robotId, CancellationToken cancellationToken = default) =>
        db.JobRobotAssignments.AsNoTracking().AnyAsync(
            a => a.RobotId == robotId && a.EndedAt == null && a.Job.Status != Enums.JobStatus.RECOVERY_REQUIRED,
            cancellationToken);
}
