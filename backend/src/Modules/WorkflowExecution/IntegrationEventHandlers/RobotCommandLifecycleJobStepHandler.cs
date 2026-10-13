using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.IntegrationEventHandlers;

/// <summary>
/// Thin status-only updates for JobStep when a linked robot command changes.
/// Does not create/edit Job or JobStep CRUD APIs.
/// </summary>
public sealed class RobotCommandLifecycleJobStepHandler(
    WorkflowExecutionDbContext db,
    ILogger<RobotCommandLifecycleJobStepHandler> logger)
    : IIntegrationEventHandler<RobotCommandLifecycleChanged>
{
    public async Task HandleAsync(
        RobotCommandLifecycleChanged integrationEvent,
        CancellationToken cancellationToken = default)
    {
        if (integrationEvent.JobStepId is not { } stepId)
        {
            return;
        }

        var step = await db.JobSteps.FirstOrDefaultAsync(s => s.Id == stepId, cancellationToken);
        if (step is null)
        {
            logger.LogDebug(
                "JobStep {JobStepId} not found for command {CommandId}; skipping",
                stepId,
                integrationEvent.CommandId);
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;
        switch (integrationEvent.Phase)
        {
            case RobotCommandLifecycleChanged.Phases.AckAccepted:
                if (step.Status is JobStepStatus.PENDING or JobStepStatus.READY or JobStepStatus.WAITING)
                {
                    step.Status = JobStepStatus.EXECUTING;
                    step.StartedAt ??= utcNow;
                }
                break;

            case RobotCommandLifecycleChanged.Phases.AckRejected:
            case RobotCommandLifecycleChanged.Phases.AckTimeout:
            case RobotCommandLifecycleChanged.Phases.OfflineAbort:
                step.Status = JobStepStatus.FAILED;
                step.CompletedAt = utcNow;
                step.ErrorCode = integrationEvent.ErrorCode ?? integrationEvent.Phase;
                break;

            case RobotCommandLifecycleChanged.Phases.Result:
                step.Status = integrationEvent.Outcome switch
                {
                    RobotCommandOutcomes.Succeeded => JobStepStatus.COMPLETED,
                    RobotCommandOutcomes.Canceled => JobStepStatus.CANCELLED,
                    _ => JobStepStatus.FAILED
                };
                step.CompletedAt = utcNow;
                step.ErrorCode = integrationEvent.ErrorCode;
                break;
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
