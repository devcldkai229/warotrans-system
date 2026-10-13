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

        await publisher.PublishAsync(mqttMessage, cancellationToken);

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
