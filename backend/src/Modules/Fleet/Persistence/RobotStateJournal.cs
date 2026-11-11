using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Persistence;

/// <summary>
/// What was true of the robot when a state was recorded, kept in the event's <c>Details</c>. Only what helps explain why
/// it changed: the battery and the error it reported. A battery the robot never measured is null, never 0 (HW-04).
/// </summary>
public sealed record RobotStateDetails(decimal? BatteryPercent, string? ErrorCode)
{
    public static RobotStateDetails From(Robot robot) => new(
        robot.BatteryMeasuredAt is null ? null : Math.Round(robot.BatteryPercent, 1),
        string.IsNullOrWhiteSpace(robot.ErrorCode) ? null : robot.ErrorCode.Trim());

    public JsonDocument ToJson() => JsonSerializer.SerializeToDocument(
        new { batteryPercent = BatteryPercent, errorCode = ErrorCode }, JsonSerializerOptions.Web);
}

/// <summary>BOTH-02: writes one line of a robot's history, with the Job it was working on then.</summary>
public static class RobotStateJournal
{
    /// <summary>
    /// For a path that has only the robot's id: the snapshot is read from the database, which is what the robot last
    /// reported. A path that is about to save the robot itself passes its current values to the other overload.
    /// </summary>
    public static async Task<RobotStateEvent> NewEventAsync(
        FleetDbContext db,
        Guid robotId,
        RobotStatus? from,
        RobotStatus to,
        string reason,
        RobotStateEventSource source,
        CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken);
        return await NewEventAsync(db, robotId, from, to, reason, source, robot is null ? null : RobotStateDetails.From(robot), cancellationToken);
    }

    public static async Task<RobotStateEvent> NewEventAsync(
        FleetDbContext db,
        Guid robotId,
        RobotStatus? from,
        RobotStatus to,
        string reason,
        RobotStateEventSource source,
        RobotStateDetails? snapshot,
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
            Details = snapshot?.ToJson(),
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
