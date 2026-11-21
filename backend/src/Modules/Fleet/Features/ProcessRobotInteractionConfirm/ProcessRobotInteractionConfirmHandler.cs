using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.ProcessRobotInteractionConfirm;

/// <summary>
/// Resolves robot by code and publishes <see cref="RobotInteractionConfirmed"/>.
/// Does not touch JobSteps — WorkflowExecution owns confirmation business logic.
/// </summary>
public sealed class ProcessRobotInteractionConfirmHandler(
    FleetDbContext db,
    IIntegrationEventPublisher events,
    ILogger<ProcessRobotInteractionConfirmHandler> logger)
{
    public async Task HandleAsync(RobotInteractionConfirmMessage message, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Code == message.RobotCode, cancellationToken);

        if (robot is null)
        {
            logger.LogWarning(
                "interaction_confirm from unknown robotCode={RobotCode} messageId={MessageId}; dropped",
                message.RobotCode,
                message.MessageId);
            return;
        }

        if (!robot.IsEnabled)
        {
            logger.LogWarning(
                "interaction_confirm from disabled robot={RobotCode} messageId={MessageId}; dropped",
                message.RobotCode,
                message.MessageId);
            return;
        }

        var capability = message.RecoveryTransfer is not null ? RobotRecoveryTransfer.Capability
            : message.HandoverStop is not null ? RobotHandoverStop.Capability : null;
        if (capability is not null && robot.Capabilities?.Split(',').Contains(capability, StringComparer.Ordinal) != true)
        {
            logger.LogWarning("Unexpected grouped interaction from robot {RobotCode}", robot.Code);
            return;
        }

        await events.PublishAsync(
            new RobotInteractionConfirmed(
                robot.Id,
                robot.Code,
                message.MessageId,
                message.JobId,
                message.JobStepId,
                message.InteractionType,
                message.ContainerId,
                message.EndpointId,
                message.SentAt,
                message.RequestMessageId,
                message.HandoverStop,
                message.RecoveryTransfer),
            cancellationToken);

        logger.LogInformation(
            "interaction_confirm forwarded robot={RobotCode} jobStepId={JobStepId} type={InteractionType} messageId={MessageId}",
            robot.Code,
            message.JobStepId,
            message.InteractionType,
            message.MessageId);
    }
}
