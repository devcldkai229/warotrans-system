using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.RobotCare;

/// <param name="StopCommandId">The STOP sent to the robot; null when the robot is offline (nothing can reach it).</param>
/// <param name="PausedJobs">Jobs of the robot that were running and are now PAUSED (Resume on the Job page continues them).</param>
/// <param name="ClearedCommands">Open commands closed so nothing the robot answers later restarts work.</param>
public sealed record EmergencyStopResult(
    Guid RobotId,
    string RobotCode,
    bool RobotOnline,
    Guid? StopCommandId,
    IReadOnlyList<string> PausedJobs,
    int ClearedCommands,
    string Message);

/// <summary>
/// "Stop now and clear its commands" from the console: STOP first (the robot holds every motion, the goal is cancelled),
/// then every running Job of the robot is paused (so the engine sends nothing new) and the robot's open commands are
/// closed. The robot stays where it is with its traffic reservations; it moves again only when someone resumes the Job,
/// or resumes the robot when it had no Job. A software stop: the physical E-stop is still the one for people at risk.
/// </summary>
public sealed class EmergencyStopService(
    WorkflowExecutionDbContext db,
    JobExecutionEngine engine,
    IFleetModule fleet,
    ILogger<EmergencyStopService> logger)
{
    public async Task<EmergencyStopResult> StopAsync(Guid robotId, string? reason, Guid actor, CancellationToken cancellationToken)
    {
        var robot = await fleet.GetRobotAsync(robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
        var why = string.IsNullOrWhiteSpace(reason) ? "Emergency stop from the console" : reason.Trim();
        if (why.Length > 200) why = why[..200];

        // 1. Stop the wheels before anything else.
        Guid? stop = robot.IsOnline ? await fleet.StopRobotAsync(robotId, "STOP", why, cancellationToken) : null;

        // 2. Pause what it was running: the engine must not send the next MOVE.
        var running = await db.JobRobotAssignments.AsNoTracking()
            .Where(a => a.RobotId == robotId && a.EndedAt == null && a.Job.Status == JobStatus.RUNNING)
            .Select(a => new { a.JobId, a.Job.JobNo })
            .Distinct()
            .ToListAsync(cancellationToken);
        var paused = new List<string>();
        foreach (var job in running)
        {
            try
            {
                await engine.PauseAsync(job.JobId, $"{JobExecutionEngine.EmergencyStopReasonPrefix} {why}", actor, cancellationToken);
                paused.Add(job.JobNo);
            }
            catch (AppException ex)
            {
                logger.LogWarning("Emergency stop of {Robot}: Job {JobNo} not paused: {Code} {Message}", robot.Code, job.JobNo, ex.Code, ex.Message);
            }
        }

        // 3. Close every open command (the pause above may have sent a STOP PAUSE: keep the newest STOP open too).
        var cleared = await fleet.ClearOpenCommandsAsync(robotId, stop, why, cancellationToken);

        var message = !robot.IsOnline
            ? $"Robot {robot.Code} is offline: no STOP can reach it. Use its physical E-stop. Its commands were cleared and its Jobs paused."
            : paused.Count > 0
                ? $"Robot {robot.Code} stopped. Paused {string.Join(", ", paused)}; resume the Job to continue."
                : $"Robot {robot.Code} stopped. Resume the robot to let it move again.";
        logger.LogWarning("Emergency stop of {Robot}: stop={Stop} paused={Paused} cleared={Cleared} reason={Reason}",
            robot.Code, stop, string.Join(",", paused), cleared, why);
        return new EmergencyStopResult(robotId, robot.Code, robot.IsOnline, stop, paused, cleared, message);
    }
}
