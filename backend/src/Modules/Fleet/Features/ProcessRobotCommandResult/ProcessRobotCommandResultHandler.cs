using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.ProcessRobotCommandResult;

public sealed class ProcessRobotCommandResultHandler(
    FleetDbContext db,
    IIntegrationEventPublisher events,
    ILogger<ProcessRobotCommandResultHandler> logger)
{
    public async Task HandleAsync(RobotCommandResultMessage message, CancellationToken cancellationToken)
    {
        var command = await db.RobotCommands
            .FirstOrDefaultAsync(c => c.Id == message.CommandId, cancellationToken);

        if (command is null)
        {
            logger.LogWarning(
                "CommandResult for unknown commandId {CommandId} robot {RobotCode}",
                message.CommandId,
                message.RobotCode);
            return;
        }

        // CANCEL command result is optional; primary correlation is on the navigate commandId.
        var utcNow = DateTimeOffset.UtcNow;
        if (!command.TryApplyResult(message.Outcome, message.ErrorCode, utcNow))
        {
            logger.LogDebug(
                "Ignored duplicate/stale command_result commandId {CommandId} status {Status}",
                command.Id,
                command.Status);
            return;
        }

        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == command.RobotId, cancellationToken);
        JobAssignment? assignment = null;
        if (command.JobAssignmentId is { } assignmentId)
        {
            assignment = await db.JobAssignments.FirstOrDefaultAsync(a => a.Id == assignmentId, cancellationToken);
        }

        if (command.Type == RobotCommandType.NAVIGATE_TO_POSE)
        {
            robot?.MarkAvailable(utcNow);

            var endReason = message.Outcome switch
            {
                RobotCommandOutcomes.Succeeded => AssignmentEndReason.COMPLETED,
                RobotCommandOutcomes.Canceled => AssignmentEndReason.CANCELLED,
                _ => AssignmentEndReason.FAILED
            };
            assignment?.TryEnd(endReason, utcNow);
        }
        else if (command.Type == RobotCommandType.CANCEL
                 && command.TargetCommandId is { } targetId)
        {
            // Ensure target navigate is closed if robot only reports cancel cmd result.
            var target = await db.RobotCommands.FirstOrDefaultAsync(c => c.Id == targetId, cancellationToken);
            if (target is not null && target.IsInFlight)
            {
                target.TryApplyResult(RobotCommandOutcomes.Canceled, message.ErrorCode, utcNow);
                if (robot?.CurrentCommandId == target.Id)
                {
                    robot.MarkAvailable(utcNow);
                }

                if (target.JobAssignmentId is { } tid)
                {
                    var targetAssignment = assignment?.Id == tid
                        ? assignment
                        : await db.JobAssignments.FirstOrDefaultAsync(a => a.Id == tid, cancellationToken);
                    targetAssignment?.TryEnd(AssignmentEndReason.CANCELLED, utcNow);
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        await events.PublishAsync(
            new RobotCommandLifecycleChanged(
                command.Id,
                command.RobotId,
                message.RobotCode,
                command.Type.ToString(),
                command.Status.ToString(),
                command.JobAssignmentId,
                command.JobStepId,
                command.Outcome,
                command.ErrorCode,
                RobotCommandLifecycleChanged.Phases.Result),
            cancellationToken);
    }
}
