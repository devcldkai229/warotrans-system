using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.PoseHistory;

/// <summary>
/// The last point kept and whether the robot was moving, per robot, between telemetry messages (singleton). After a
/// restart it is empty, so the first reading of each robot is kept.
/// </summary>
public sealed class RobotPoseTrail
{
    private readonly ConcurrentDictionary<Guid, (PoseReading? LastKept, bool WasMoving)> entries = new();

    public (PoseReading? LastKept, bool WasMoving) Get(Guid robotId) =>
        entries.TryGetValue(robotId, out var entry) ? entry : (null, false);

    public void Set(Guid robotId, PoseReading? lastKept, bool wasMoving) => entries[robotId] = (lastKept, wasMoving);
}

/// <summary>FE-09 / SDD 3.3: decides whether a telemetry pose is kept and stores it with the robot's Job.</summary>
public sealed class RobotPoseHistoryRecorder(
    FleetDbContext db,
    RobotPoseTrail trail,
    IOptions<RobotHistoryOptions> options,
    ILogger<RobotPoseHistoryRecorder> logger)
{
    /// <summary>
    /// Called with the telemetry just applied. A message without a pose, or a pose without localization, means
    /// nothing about where the robot went and is skipped.
    /// </summary>
    public async Task RecordAsync(Robot robot, bool reportedPose, DateTimeOffset utcNow, CancellationToken cancellationToken)
    {
        if (!reportedPose || robot.LocalizationStatus != LocalizationStatus.LOCALIZED)
        {
            return;
        }

        var reading = new PoseReading(
            robot.PoseX,
            robot.PoseY,
            robot.PoseYaw,
            robot.LinearVelocity,
            robot.AngularVelocity,
            robot.MapVersionCode,
            utcNow);
        var (lastKept, wasMoving) = trail.Get(robot.Id);
        var keep = RobotPoseSampling.ShouldKeep(lastKept, wasMoving, reading, options.Value);
        trail.Set(robot.Id, keep ? reading : lastKept, reading.IsMoving);
        if (!keep)
        {
            return;
        }

        try
        {
            var jobId = await db.JobAssignments.AsNoTracking()
                .Where(a => a.RobotId == robot.Id && a.Status != JobAssignmentStatus.ENDED)
                .OrderByDescending(a => a.AssignedAt)
                .Select(a => (Guid?)a.JobId)
                .FirstOrDefaultAsync(cancellationToken);

            db.RobotPoseSamples.Add(new RobotPoseSample
            {
                Id = Guid.NewGuid(),
                RobotId = robot.Id,
                JobId = jobId,
                CommandId = robot.CurrentCommandId,
                X = reading.X,
                Y = reading.Y,
                Yaw = reading.Yaw,
                LinearVelocity = reading.LinearVelocity,
                AngularVelocity = reading.AngularVelocity,
                MapVersionCode = reading.MapVersionCode,
                RecordedAt = utcNow
            });
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // History is a record, not control: losing a point must never stop telemetry from being applied.
            logger.LogWarning(exception, "Could not store a movement history point for robot {RobotCode}", robot.Code);
            trail.Set(robot.Id, lastKept, reading.IsMoving);
        }
    }
}
