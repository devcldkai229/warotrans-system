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

namespace WaroTrans.Fleet.Features.IssueNavigateCommand;

public sealed class IssueNavigateCommandHandler(
    FleetDbContext db,
    IMqttRobotCommandPublisher publisher,
    IIntegrationEventPublisher events)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private const int MaxSaveAttempts = 3;

    public async Task<IssueNavigateCommandResponse> HandleAsync(
        Guid robotId,
        IssueNavigateCommandRequest request,
        CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await IssueAsync(robotId, request, cancellationToken);
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxSaveAttempts)
            {
                // Telemetry (several per second) updated the robot row between read and save. Nothing was
                // published yet: drop the stale entities and issue again from a fresh read.
                db.ChangeTracker.Clear();
            }
        }
    }

    private async Task<IssueNavigateCommandResponse> IssueAsync(
        Guid robotId,
        IssueNavigateCommandRequest request,
        CancellationToken cancellationToken)
    {
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        if (!robot.IsEnabled)
        {
            throw new DomainValidationException("Robot is disabled.", "robot_disabled");
        }

        if (!robot.IsOnline)
        {
            throw new DomainValidationException("Robot is offline.", "robot_offline");
        }

        var hasInFlight = await db.RobotCommands.AnyAsync(
            c => c.RobotId == robotId
                 && (c.Status == RobotCommandStatus.SENT
                     || c.Status == RobotCommandStatus.ACKED
                     || c.Status == RobotCommandStatus.RUNNING),
            cancellationToken);

        if (hasInFlight || robot.CurrentCommandId is not null)
        {
            throw new DomainValidationException("Robot already has an in-flight command.", "robot_busy");
        }

        var utcNow = DateTimeOffset.UtcNow;
        var commandId = Guid.NewGuid();
        var frameId = string.IsNullOrWhiteSpace(request.FrameId) ? "map" : request.FrameId.Trim();
        var posePayload = new NavigateToPosePayload
        {
            FrameId = frameId,
            X = request.X,
            Y = request.Y,
            Yaw = request.Yaw,
            Route = request.Route is { } route && !string.IsNullOrWhiteSpace(route.GraphHash)
                ? new RouteGrantPayload
                {
                    GraphHash = route.GraphHash.Trim(),
                    EdgeIds = route.EdgeIds?.ToList() ?? []
                }
                : null,
            Authority = request.Authority
        };
        var payloadJson = JsonSerializer.Serialize(posePayload, JsonOptions);

        JobAssignment? assignment = null;
        if (request.JobAssignmentId is { } assignmentId)
        {
            assignment = await db.JobAssignments.FirstOrDefaultAsync(a => a.Id == assignmentId, cancellationToken)
                ?? throw new NotFoundException($"JobAssignment '{assignmentId}' was not found.", "job_assignment_not_found");
            if (assignment.RobotId != robot.Id)
            {
                throw new DomainValidationException(
                    "JobAssignment does not belong to this robot.",
                    "job_assignment_robot_mismatch");
            }

            assignment.EnsureNotEnded();
        }
        else if (request.JobId is { } jobId)
        {
            assignment = JobAssignment.CreatePending(jobId, robot.Id, utcNow);
            db.JobAssignments.Add(assignment);
        }

        var command = RobotCommand.CreateNavigate(
            robot.Id,
            commandId,
            payloadJson,
            utcNow,
            assignment?.Id,
            request.JobStepId);

        db.RobotCommands.Add(command);
        robot.ReserveForCommand(commandId, utcNow);

        await db.SaveChangesAsync(cancellationToken);

        var mqttMessage = new RobotCommandMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = commandId,
            RobotCode = robot.Code,
            Type = RobotCommandTypes.NavigateToPose,
            IssuedAt = utcNow,
            JobAssignmentId = assignment?.Id,
            JobStepId = request.JobStepId,
            Payload = JsonSerializer.SerializeToElement(posePayload, JsonOptions)
        };

        // PublishedAt starts the ACK timeout; a broker that cannot be reached fails the command and frees the robot.
        await db.PublishAndStampAsync(publisher, mqttMessage, robot.Id, releasesRobot: true, cancellationToken);

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

        return new IssueNavigateCommandResponse(
            command.Id,
            robot.Id,
            robot.Code,
            command.Status,
            command.JobAssignmentId,
            command.JobStepId);
    }
}
