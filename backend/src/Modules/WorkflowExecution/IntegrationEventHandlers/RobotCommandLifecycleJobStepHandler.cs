using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.IntegrationEventHandlers;

/// <summary>
/// Robot command lifecycle (Fleet) → status of the MOVE JobStep that issued it.
/// When the step finishes (RESULT / rejection / timeout / offline) the Job engine advances to the next step.
/// </summary>
public sealed class RobotCommandLifecycleJobStepHandler(
    WorkflowExecutionDbContext db,
    JobExecutionEngine engine,
    IIntegrationEventPublisher events,
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

        var step = await db.JobSteps
            .Include(s => s.JobTask)
            .FirstOrDefaultAsync(s => s.Id == stepId, cancellationToken);
        if (step is null)
        {
            logger.LogDebug(
                "JobStep {JobStepId} not found for command {CommandId}; skipping",
                stepId,
                integrationEvent.CommandId);
            return;
        }

        if (step.Status is JobStepStatus.COMPLETED or JobStepStatus.FAILED or JobStepStatus.CANCELLED)
        {
            return; // late / duplicate lifecycle event
        }

        var utcNow = DateTimeOffset.UtcNow;
        var finished = false;
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
                step.ErrorMessage = $"Robot command {integrationEvent.Phase}";
                step.OutputValues = MoveOutputs(step, "FAILED", utcNow, step.ErrorCode);
                finished = true;
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
                if (step.Status != JobStepStatus.COMPLETED)
                {
                    step.ErrorMessage = $"Navigation {integrationEvent.Outcome}";
                }

                step.OutputValues = MoveOutputs(
                    step,
                    integrationEvent.Outcome == RobotCommandOutcomes.Canceled ? "CANCELED"
                        : integrationEvent.Outcome == RobotCommandOutcomes.Succeeded ? "SUCCEEDED" : "FAILED",
                    utcNow,
                    integrationEvent.ErrorCode);
                finished = true;
                break;
        }

        await db.SaveChangesAsync(cancellationToken);

        if (!finished)
        {
            return;
        }

        var stepKey = await db.WorkflowSteps.AsNoTracking()
            .Where(w => w.Id == step.WorkflowStepId)
            .Select(w => w.StepKey)
            .FirstAsync(cancellationToken);
        await events.PublishAsync(
            new JobStepStatusChanged(step.JobTask.JobId, step.JobTaskId, step.Id, stepKey, step.Status.ToString(), step.ErrorCode),
            cancellationToken);

        await engine.AdvanceAsync(step.JobTask.JobId, cancellationToken);
    }

    private static Dictionary<string, JsonElement> MoveOutputs(
        Entities.JobStep step,
        string navigationResult,
        DateTimeOffset completedAt,
        string? failureReason)
    {
        var outputs = new Dictionary<string, JsonElement>(step.OutputValues)
        {
            ["navigationResult"] = JsonSerializer.SerializeToElement(navigationResult),
            ["completedAt"] = JsonSerializer.SerializeToElement(completedAt)
        };
        if (navigationResult == "SUCCEEDED" && step.TargetEndpointId is { } arrived)
        {
            outputs["arrivedEndpointId"] = JsonSerializer.SerializeToElement(arrived);
        }

        if (failureReason is not null)
        {
            outputs["failureReason"] = JsonSerializer.SerializeToElement(failureReason);
        }

        return outputs;
    }
}
