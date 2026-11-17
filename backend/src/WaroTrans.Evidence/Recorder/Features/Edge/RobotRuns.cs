using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Recorder.Services;

namespace WaroTrans.Evidence.Recorder.Features.Edge;

/// <summary>A robot may only write to its own runs and recordings: everything below checks the signed-in robot code.</summary>
internal static class RobotRuns
{
    /// <summary>
    /// The run the robot had at <paramref name="at"/>: the assignment window that contains it. A recording that starts
    /// a moment before the assignment event reached Evidence still finds its run (2 s of slack).
    /// </summary>
    public static async Task<RobotRunEvidence?> AtAsync(EvidenceDbContext db, string robotCode, DateTimeOffset at, CancellationToken ct)
    {
        var slack = at.AddSeconds(2);
        return await db.Runs
            .Where(r => r.RobotId == robotCode && r.StartedAtUtc <= slack && (r.EndedAtUtc == null || r.EndedAtUtc >= at))
            .OrderByDescending(r => r.StartedAtUtc)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>The run if it is this robot's; null otherwise (the caller answers 404, never revealing other robots' runs).</summary>
    public static Task<RobotRunEvidence?> OwnAsync(EvidenceDbContext db, ClaimsPrincipal robot, Guid runId, CancellationToken ct)
    {
        var code = robot.RobotCode();
        return db.Runs.FirstOrDefaultAsync(r => r.Id == runId && r.RobotId == code, ct);
    }

    public static Task<CameraRecording?> OwnRecordingAsync(EvidenceDbContext db, ClaimsPrincipal robot, Guid recordingId, CancellationToken ct)
    {
        var code = robot.RobotCode();
        return db.Recordings.Include(r => r.Run).ThenInclude(r => r.Journal)
            .FirstOrDefaultAsync(r => r.Id == recordingId && r.Run.RobotId == code, ct);
    }

    public static IResult NotFound(string what) =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: $"No such {what} for this robot.");

    public static IResult Invalid(string message) =>
        Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: message);
}
