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
    /// A command that has just closed may still be reported by the robot for a few seconds (its next authority_state was
    /// already on its way): no orphan CANCEL inside this window. Also the least time between two orphan CANCELs.
    /// </summary>
    public static readonly TimeSpan OrphanGrace = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Whether a CANCEL goes out for a NAVIGATE the robot still reports: the NAVIGATE is closed (whatever its outcome)
    /// and has been for <see cref="OrphanGrace"/>, and no CANCEL for it is in flight or was sent within that grace.
    /// </summary>
    public static bool OrphanCancelDue(RobotCommand target, IEnumerable<RobotCommand> earlierCancels, DateTimeOffset now)
    {
        if (target.IsInFlight || (target.CompletedAt is { } completedAt && now - completedAt < OrphanGrace))
        {
            return false;
        }

        return !earlierCancels.Any(c => c.IsInFlight || now - c.IssuedAt < OrphanGrace);
    }

    /// <summary>
    /// The robot reports it still executes a NAVIGATE this backend has closed (aborted or cancelled while the robot was
    /// offline): tell it to stop. Sent per report until the robot lets go — whatever the closed command's outcome, a
    /// robot still driving it must be stopped — but one at a time: not while a CANCEL for it is in flight or was sent
    /// within <see cref="OrphanGrace"/>. A CANCEL that failed or timed out is therefore sent again.
    /// </summary>
    public async Task<bool> CancelOrphanAsync(Guid robotId, Guid targetCommandId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var target = await db.RobotCommands.AsNoTracking().FirstOrDefaultAsync(
            c => c.Id == targetCommandId && c.RobotId == robotId && c.Type == RobotCommandType.NAVIGATE_TO_POSE,
            cancellationToken);
        if (target is null)
        {
            return false;
        }

        var earlierCancels = await db.RobotCommands.AsNoTracking()
            .Where(c => c.RobotId == robotId && c.Type == RobotCommandType.CANCEL && c.TargetCommandId == targetCommandId)
            .ToListAsync(cancellationToken);
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken);
        if (robot is null || !OrphanCancelDue(target, earlierCancels, now))
        {
            return false;
        }

        var utcNow = now;
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
