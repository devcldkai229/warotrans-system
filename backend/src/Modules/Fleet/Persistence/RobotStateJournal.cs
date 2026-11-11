using Microsoft.EntityFrameworkCore;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Persistence;

/// <summary>BOTH-02: writes one line of a robot's history, with the Job it was working on then.</summary>
public static class RobotStateJournal
{
    public static async Task<RobotStateEvent> NewEventAsync(
        FleetDbContext db,
        Guid robotId,
        RobotStatus? from,
        RobotStatus to,
        string reason,
        RobotStateEventSource source,
        CancellationToken cancellationToken)
    {
        var jobId = await db.JobAssignments.AsNoTracking()
            .Where(a => a.RobotId == robotId && a.EndedAt == null)
            .OrderByDescending(a => a.AssignedAt)
            .Select(a => (Guid?)a.JobId)
            .FirstOrDefaultAsync(cancellationToken);
        return new RobotStateEvent
        {
            Id = Guid.NewGuid(),
            RobotId = robotId,
            JobId = jobId,
            FromStatus = from,
            ToStatus = to,
            Reason = reason,
            Source = source,
            OccurredAt = DateTimeOffset.UtcNow
        };
    }

    /// <summary>For paths that update the robot with ExecuteUpdate. History must never get in the way of liveness.</summary>
    public static async Task WriteAsync(
        FleetDbContext db,
        Guid robotId,
        RobotStatus status,
        string reason,
        RobotStateEventSource source,
        CancellationToken cancellationToken)
    {
        try
        {
            db.RobotStateEvents.Add(await NewEventAsync(db, robotId, status, status, reason, source, cancellationToken));
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
        }
    }
}
