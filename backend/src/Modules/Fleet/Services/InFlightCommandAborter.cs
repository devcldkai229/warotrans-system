using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Services;

/// <summary>
/// Ends the commands a robot can no longer be running: it went offline (<see cref="RobotOffline"/>) or its gateway
/// restarted with a new bootId and forgot them (<see cref="RobotRestarted"/>, 2026-11-18: a NAVIGATE left RUNNING across a
/// stack restart kept the robot EXECUTING, so LOCALIZE answered robot_busy forever). Same consequences either way: the
/// command is ABORTED, its traffic authority revoked, its job assignment ended, WorkflowExecution told (OfflineAbort), and
/// the robot back to AVAILABLE. The caller saves.
/// </summary>
public sealed class InFlightCommandAborter(FleetDbContext db, IIntegrationEventPublisher events, IServiceProvider services)
{
    public const string RobotOffline = "ROBOT_OFFLINE";
    public const string RobotRestarted = "ROBOT_RESTARTED";

    /// <returns>How many commands were aborted.</returns>
    /// <param name="resetStaleExecuting">Gateway restart: an EXECUTING robot with nothing left in flight is stale too.</param>
    /// <param name="onlyCommandId">Only this command (a CANCEL the robot refused with UNKNOWN_TARGET), not every one in flight.</param>
    public async Task<int> AbortAsync(Robot robot, string errorCode, DateTimeOffset utcNow, CancellationToken cancellationToken,
        bool resetStaleExecuting = false, Guid? onlyCommandId = null)
    {
        var inFlight = await db.RobotCommands
            .Where(c => c.RobotId == robot.Id
                        && (c.Status == RobotCommandStatus.SENT
                            || c.Status == RobotCommandStatus.ACKED
                            || c.Status == RobotCommandStatus.RUNNING)
                        && (onlyCommandId == null || c.Id == onlyCommandId))
            .ToListAsync(cancellationToken);

        var aborted = 0;
        var abortedNavigate = false;
        var segmented = services.GetService<ISegmentedTrafficCoordinator>();
        foreach (var command in inFlight)
        {
            if (!command.TryAbortOffline(utcNow, errorCode))
            {
                continue;
            }

            aborted++;
            if (command.Type == RobotCommandType.NAVIGATE_TO_POSE)
            {
                abortedNavigate = true;
                // The NAVIGATE no longer exists for the backend: its traffic authority must not outlive it (the robot
                // would resume and keep renewing it). Revoked here, occupancy kept.
                if (segmented is not null)
                {
                    await segmented.CompleteRouteAsync(robot.Id, false, errorCode, null, cancellationToken, command.Id);
                }
            }

            if (command.JobAssignmentId is { } assignmentId)
            {
                var assignment = await db.JobAssignments.FirstOrDefaultAsync(a => a.Id == assignmentId, cancellationToken);
                assignment?.TryEnd(AssignmentEndReason.ROBOT_OFFLINE, utcNow);
            }

            await events.PublishAsync(
                new RobotCommandLifecycleChanged(
                    command.Id,
                    robot.Id,
                    robot.Code,
                    command.Type.ToString(),
                    command.Status.ToString(),
                    command.JobAssignmentId,
                    command.JobStepId,
                    null,
                    command.ErrorCode,
                    RobotCommandLifecycleChanged.Phases.OfflineAbort),
                cancellationToken);
        }

        // EXECUTING with nothing left in flight is stale as well (a restart lost the result that would have cleared it).
        if (abortedNavigate || (resetStaleExecuting && robot.Status == RobotStatus.EXECUTING && aborted == inFlight.Count))
        {
            robot.MarkAvailable(utcNow);
        }
        else
        {
            robot.ClearCurrentCommand(utcNow);
        }

        return aborted;
    }
}
