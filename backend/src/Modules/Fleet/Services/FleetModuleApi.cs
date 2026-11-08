using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Features.DispatchRobot;
using WaroTrans.Fleet.Features.IssueCancelCommand;
using WaroTrans.Fleet.Features.IssueNavigateCommand;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

public sealed class FleetModuleApi(
    FleetDbContext db,
    IssueNavigateCommandHandler issueNavigateCommandHandler,
    IssueCancelCommandHandler issueCancelCommandHandler,
    WaroTrans.Fleet.Features.RobotControl.RobotControlService robotControl,
    IMqttRobotInteractionPublisher interactionPublisher,
    ILogger<FleetModuleApi> logger) : IFleetModule
{
    public async Task<RobotSnapshot?> GetRobotAsync(Guid robotId, CancellationToken cancellationToken = default)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken);
        return robot is null ? null : ToSnapshot(robot);
    }

    public async Task<IReadOnlyList<RobotSnapshot>> GetDispatchCandidatesAsync(
        Guid mapVersionId,
        CancellationToken cancellationToken = default)
    {
        var robots = await db.Robots
            .AsNoTracking()
            .Where(r => r.CurrentMapVersionId == mapVersionId)
            .ToListAsync(cancellationToken);

        // Same ordering rule as DispatchRobotSelector (highest battery, then code).
        var candidates = new List<RobotSnapshot>();
        var remaining = robots.ToList();
        while (DispatchRobotSelector.Select(remaining) is { } best)
        {
            candidates.Add(ToSnapshot(best));
            remaining.Remove(best);
        }

        return candidates;
    }

    public async Task<Guid> NavigateAsync(
        Guid robotId,
        double x,
        double y,
        double yaw,
        Guid jobId,
        Guid jobStepId,
        CancellationToken cancellationToken = default,
        RouteGrantSnapshot? route = null,
        double? timeoutSeconds = null)
    {
        // JobId without JobAssignmentId: Fleet records one assignment per navigate command
        // (ended by its RESULT). The Job keeps its robot in WorkflowExecution (assignedRobotId).
        // The handler retries the telemetry/command race on the robot row itself.
        RouteGrantPayload? routePayload = route is null
            ? null
            : new RouteGrantPayload
            {
                GraphHash = route.GraphHash,
                EdgeIds = route.EdgeIds.ToList()
            };
        var response = await issueNavigateCommandHandler.HandleAsync(
            robotId,
            new IssueNavigateCommandRequest(x, y, yaw, "map", jobId, null, jobStepId, routePayload, TimeoutSeconds: timeoutSeconds),
            cancellationToken);
        return response.CommandId;
    }

    public async Task<bool> CancelNavigationAsync(
        Guid robotId,
        Guid navigateCommandId,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await issueCancelCommandHandler.HandleAsync(
                robotId, new IssueCancelCommandRequest(navigateCommandId), cancellationToken);
            return true;
        }
        catch (AppException ex)
        {
            logger.LogWarning(
                "CANCEL of navigate {CommandId} on robot {RobotId} not sent: {Code} {Message}",
                navigateCommandId, robotId, ex.Code, ex.Message);
            return false;
        }
    }

    public async Task RequestHumanInteractionAsync(
        Guid robotId,
        Guid jobId,
        Guid jobStepId,
        string interactionType,
        Guid containerId,
        Guid endpointId,
        CancellationToken cancellationToken = default)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        await interactionPublisher.PublishRequestAsync(
            new RobotInteractionRequestMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                RobotCode = robot.Code,
                JobId = jobId,
                JobStepId = jobStepId,
                InteractionType = interactionType,
                ContainerId = containerId,
                EndpointId = endpointId,
                SentAt = DateTimeOffset.UtcNow
            },
            cancellationToken);

        logger.LogInformation(
            "Armed HUMAN_INTERACTION {InteractionType} on robot {RobotCode} for jobStepId={JobStepId}",
            interactionType,
            robot.Code,
            jobStepId);
    }

    public async Task PublishInteractionResultAsync(
        Guid robotId,
        Guid jobStepId,
        Guid confirmMessageId,
        bool accepted,
        string? reasonCode,
        CancellationToken cancellationToken = default)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        await interactionPublisher.PublishResultAsync(
            new RobotInteractionResultMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                RobotCode = robot.Code,
                JobStepId = jobStepId,
                ConfirmMessageId = confirmMessageId,
                Accepted = accepted,
                ReasonCode = reasonCode,
                ProcessedAt = DateTimeOffset.UtcNow
            },
            cancellationToken);
    }

    public async Task<Guid?> StopRobotAsync(Guid robotId, string mode, string? reason, CancellationToken cancellationToken = default)
    {
        try
        {
            return (await robotControl.StopAsync(robotId, mode, reason, cancellationToken)).CommandId;
        }
        catch (AppException ex)
        {
            logger.LogWarning("STOP for robot {RobotId} not sent: {Code} {Message}", robotId, ex.Code, ex.Message);
            return null;
        }
    }

    public async Task<Guid?> ResumeRobotAsync(Guid robotId, CancellationToken cancellationToken = default)
    {
        try
        {
            return (await robotControl.ResumeAsync(robotId, cancellationToken)).CommandId;
        }
        catch (AppException ex)
        {
            logger.LogWarning("RESUME for robot {RobotId} not sent: {Code} {Message}", robotId, ex.Code, ex.Message);
            return null;
        }
    }

    private static RobotSnapshot ToSnapshot(Robot r) => new(
        r.Id,
        r.Code,
        r.WarehouseId,
        r.CurrentMapVersionId,
        r.Status,
        r.IsEnabled,
        r.IsOnline,
        r.LocalizationStatus,
        r.NavigationStatus,
        r.BatteryPercent,
        r.LastTelemetryAt,
        r.PoseX,
        r.PoseY,
        r.PoseYaw,
        r.MotionHeld,
        r.HasActiveManualLease(DateTimeOffset.UtcNow));
}
