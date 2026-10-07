using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.ProcessRobotCommandAck;

public sealed class ProcessRobotCommandAckHandler(
    FleetDbContext db,
    IIntegrationEventPublisher events,
    ILogger<ProcessRobotCommandAckHandler> logger)
{
    public async Task HandleAsync(RobotCommandAckMessage message, CancellationToken cancellationToken)
    {
        var command = await db.RobotCommands
            .FirstOrDefaultAsync(c => c.Id == message.CommandId, cancellationToken);

        if (command is null)
        {
            logger.LogWarning(
                "CommandAck for unknown commandId {CommandId} robot {RobotCode}",
                message.CommandId,
                message.RobotCode);
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;
        if (!command.TryApplyAck(message.Accepted, message.ReasonCode, utcNow))
        {
            logger.LogDebug(
                "Ignored duplicate/stale command_ack commandId {CommandId} status {Status}",
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

        string phase;
        if (message.Accepted)
        {
            phase = RobotCommandLifecycleChanged.Phases.AckAccepted;
            if (command.Type == RobotCommandType.NAVIGATE_TO_POSE)
            {
                robot?.MarkExecuting(command.Id, utcNow);
                assignment?.TryAcknowledge(utcNow);
                assignment?.TryActivate(utcNow);
            }
            // CANCEL ack: wait for navigate command_result CANCELED
        }
        else
        {
            phase = RobotCommandLifecycleChanged.Phases.AckRejected;
            if (command.Type == RobotCommandType.NAVIGATE_TO_POSE)
            {
                robot?.MarkAvailable(utcNow);
                assignment?.TryEnd(AssignmentEndReason.ROBOT_REJECTED, utcNow);
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
                null,
                command.RejectReasonCode ?? command.ErrorCode,
                phase),
            cancellationToken);
    }
}
