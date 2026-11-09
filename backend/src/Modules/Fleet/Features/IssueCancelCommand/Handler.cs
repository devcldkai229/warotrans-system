using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Services;

namespace WaroTrans.Fleet.Features.IssueCancelCommand;

public sealed class IssueCancelCommandHandler(
    FleetDbContext db,
    IMqttRobotCommandPublisher publisher,
    IIntegrationEventPublisher events)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>
    /// The robot reports it still executes a NAVIGATE this backend has closed (aborted while the robot was offline):
    /// tell it to stop. Sent per report until the robot lets go; one at a time, and never for an unknown or open command.
    /// </summary>
    public async Task<bool> CancelOrphanAsync(Guid robotId, Guid targetCommandId, CancellationToken cancellationToken)
    {
        var target = await db.RobotCommands.AsNoTracking().FirstOrDefaultAsync(
            c => c.Id == targetCommandId && c.RobotId == robotId && c.Type == RobotCommandType.NAVIGATE_TO_POSE,
            cancellationToken);
        if (target is null || target.IsInFlight)
        {
            return false;
        }

        var pending = await db.RobotCommands.AnyAsync(
            c => c.RobotId == robotId && c.Type == RobotCommandType.CANCEL && c.TargetCommandId == targetCommandId
                 && c.Status == RobotCommandStatus.SENT,
            cancellationToken);
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken);
        if (pending || robot is null)
        {
            return false;
        }

        var utcNow = DateTimeOffset.UtcNow;
        var commandId = Guid.NewGuid();
        var payload = new CancelCommandPayload { TargetCommandId = targetCommandId };
        db.RobotCommands.Add(RobotCommand.CreateCancel(
            robotId, commandId, targetCommandId, JsonSerializer.Serialize(payload, JsonOptions), utcNow,
            target.JobAssignmentId, target.JobStepId));
        await db.SaveChangesAsync(cancellationToken);
        await db.PublishAndStampAsync(
            publisher,
            new RobotCommandMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                CommandId = commandId,
                RobotCode = robot.Code,
                Type = RobotCommandTypes.Cancel,
                IssuedAt = utcNow,
                JobAssignmentId = target.JobAssignmentId,
                JobStepId = target.JobStepId,
                Payload = JsonSerializer.SerializeToElement(payload, JsonOptions)
            },
            robotId,
            releasesRobot: false,
            cancellationToken);
        return true;
    }

    public async Task<IssueCancelCommandResponse> HandleAsync(
        Guid robotId,
        IssueCancelCommandRequest request,
        CancellationToken cancellationToken)
    {
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        if (!robot.IsOnline)
        {
            throw new DomainValidationException("Robot is offline.", "robot_offline");
        }

        var targetId = request.TargetCommandId ?? robot.CurrentCommandId
            ?? throw new DomainValidationException(
                "No target command to cancel.",
                "no_target_command");

        var target = await db.RobotCommands.FirstOrDefaultAsync(
            c => c.Id == targetId && c.RobotId == robotId,
            cancellationToken)
            ?? throw new NotFoundException($"RobotCommand '{targetId}' was not found.", "robot_command_not_found");

        if (!target.IsInFlight)
        {
            throw new DomainValidationException(
                "Target command is not in-flight.",
                "target_not_in_flight");
        }

        var utcNow = DateTimeOffset.UtcNow;
        var commandId = Guid.NewGuid();
        var cancelPayload = new CancelCommandPayload { TargetCommandId = targetId };
        var payloadJson = JsonSerializer.Serialize(cancelPayload, JsonOptions);

        var command = RobotCommand.CreateCancel(
            robot.Id,
            commandId,
            targetId,
            payloadJson,
            utcNow,
            target.JobAssignmentId,
            target.JobStepId);

        db.RobotCommands.Add(command);
        await db.SaveChangesAsync(cancellationToken);

        var mqttMessage = new RobotCommandMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = commandId,
            RobotCode = robot.Code,
            Type = RobotCommandTypes.Cancel,
            IssuedAt = utcNow,
            JobAssignmentId = target.JobAssignmentId,
            JobStepId = target.JobStepId,
            Payload = JsonSerializer.SerializeToElement(cancelPayload, JsonOptions)
        };

        // A CANCEL that cannot be sent leaves the navigate command (and the robot) as they are.
        await db.PublishAndStampAsync(publisher, mqttMessage, robot.Id, releasesRobot: false, cancellationToken);

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
                null,
                RobotCommandLifecycleChanged.Phases.Issued),
            cancellationToken);

        return new IssueCancelCommandResponse(
            command.Id,
            targetId,
            robot.Id,
            robot.Code,
            command.Status);
    }
}
