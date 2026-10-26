using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.IntegrationEventHandlers;

/// <summary>
/// Validates robot-button confirmation against the current WAITING HUMAN_INTERACTION step,
/// then completes through <see cref="JobExecutionEngine.ConfirmHumanStepAsync"/> (same path as Staff).
/// </summary>
public sealed class RobotInteractionConfirmedHandler(
    WorkflowExecutionDbContext db,
    JobExecutionEngine engine,
    IFleetModule fleet,
    ILogger<RobotInteractionConfirmedHandler> logger)
    : IIntegrationEventHandler<RobotInteractionConfirmed>
{
    public async Task HandleAsync(RobotInteractionConfirmed e, CancellationToken cancellationToken = default)
    {
        var step = await db.JobSteps
            .Include(s => s.JobTask)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == e.JobStepId, cancellationToken);

        if (step is null)
        {
            await PublishResultAsync(e, accepted: false, "interaction_step_not_found", cancellationToken);
            return;
        }

        var job = await db.Jobs.AsNoTracking().FirstAsync(j => j.Id == step.JobTask.JobId, cancellationToken);
        if (e.JobId != job.Id)
        {
            await PublishResultAsync(e, accepted: false, "interaction_wrong_job", cancellationToken);
            return;
        }

        // Idempotent: same button / MQTT duplicate after the step already completed via ROBOT_BUTTON.
        if (step.Status == JobStepStatus.COMPLETED)
        {
            var existing = await db.HandoverConfirmations.AsNoTracking()
                .FirstOrDefaultAsync(h => h.JobStepId == e.JobStepId, cancellationToken);
            if (existing is not null
                && existing.ConfirmationSource == ConfirmationSource.ROBOT_BUTTON
                && (existing.SourceMessageId == e.MessageId || existing.SourceMessageId is not null))
            {
                await PublishResultAsync(e, accepted: true, "ALREADY_CONFIRMED", cancellationToken);
                return;
            }

            await PublishResultAsync(e, accepted: false, "interaction_not_current", cancellationToken);
            return;
        }

        if (job.Status != JobStatus.RUNNING)
        {
            await PublishResultAsync(e, accepted: false, "job_not_running", cancellationToken);
            return;
        }

        var assignedRobotId = job.ContextValues.TryGetValue(JobExecutionEngine.AssignedRobotKey, out var rid)
            && rid.ValueKind == System.Text.Json.JsonValueKind.String
            ? rid.GetGuid()
            : (Guid?)null;

        if (assignedRobotId != e.RobotId)
        {
            await PublishResultAsync(e, accepted: false, "interaction_wrong_robot", cancellationToken);
            return;
        }

        if (step.StepType != StepType.HUMAN_INTERACTION || step.Status != JobStepStatus.WAITING)
        {
            await PublishResultAsync(e, accepted: false, "interaction_not_current", cancellationToken);
            return;
        }

        // Only the Job's current (first non-terminal) WAITING/EXECUTING step may be confirmed.
        var currentStepId = await FindCurrentStepIdAsync(job.Id, cancellationToken);
        if (currentStepId != e.JobStepId)
        {
            await PublishResultAsync(e, accepted: false, "interaction_not_current", cancellationToken);
            return;
        }

        var workflowStep = await db.WorkflowSteps.AsNoTracking()
            .SingleAsync(s => s.Id == step.WorkflowStepId, cancellationToken);
        var operation = workflowStep.Config.OperationCode;

        if (operation is not (nameof(HumanActionCode.PICKUP_CONFIRM) or nameof(HumanActionCode.DROPOFF_CONFIRM)))
        {
            await PublishResultAsync(e, accepted: false, "interaction_type_unsupported", cancellationToken);
            return;
        }

        if (!string.Equals(e.InteractionType, operation, StringComparison.Ordinal))
        {
            await PublishResultAsync(e, accepted: false, "interaction_type_mismatch", cancellationToken);
            return;
        }

        if (!step.ResolvedInputs.TryGetValue("containerId", out var expectedContainer)
            || expectedContainer.GetGuid() != e.ContainerId)
        {
            await PublishResultAsync(e, accepted: false, "handover_container_mismatch", cancellationToken);
            return;
        }

        if (!step.ResolvedInputs.TryGetValue("endpointId", out var expectedEndpoint)
            || expectedEndpoint.GetGuid() != e.EndpointId)
        {
            await PublishResultAsync(e, accepted: false, "interaction_endpoint_mismatch", cancellationToken);
            return;
        }

        try
        {
            await engine.ConfirmHumanStepAsync(
                e.JobStepId,
                e.ContainerId,
                HumanConfirmationSource.RobotButton(e.RobotId, e.MessageId),
                cancellationToken);

            await PublishResultAsync(e, accepted: true, reasonCode: null, cancellationToken);
            logger.LogInformation(
                "ROBOT_BUTTON confirmed {InteractionType} jobStepId={JobStepId} robot={RobotCode}",
                e.InteractionType,
                e.JobStepId,
                e.RobotCode);
        }
        catch (DbUpdateException)
        {
            // Unique JobStepId / SourceMessageId: concurrent duplicate → idempotent accept.
            var again = await db.HandoverConfirmations.AsNoTracking()
                .FirstOrDefaultAsync(h => h.JobStepId == e.JobStepId, cancellationToken);
            if (again is not null && again.ConfirmationSource == ConfirmationSource.ROBOT_BUTTON)
            {
                await PublishResultAsync(e, accepted: true, "ALREADY_CONFIRMED", cancellationToken);
                return;
            }

            await PublishResultAsync(e, accepted: false, "interaction_conflict", cancellationToken);
        }
        catch (AppException ex)
        {
            await PublishResultAsync(e, accepted: false, ex.Code ?? "interaction_rejected", cancellationToken);
        }
    }

    private async Task<Guid?> FindCurrentStepIdAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var job = await db.Jobs
            .AsNoTracking()
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .AsSplitQuery()
            .FirstAsync(j => j.Id == jobId, cancellationToken);

        foreach (var task in job.JobTasks.OrderBy(t => t.SequenceNo))
        {
            foreach (var s in task.JobSteps.OrderBy(s => s.SequenceNo))
            {
                if (s.Status is JobStepStatus.COMPLETED)
                {
                    continue;
                }

                return s.Id;
            }
        }

        return null;
    }

    private Task PublishResultAsync(
        RobotInteractionConfirmed e,
        bool accepted,
        string? reasonCode,
        CancellationToken cancellationToken) =>
        fleet.PublishInteractionResultAsync(
            e.RobotId,
            e.JobStepId,
            e.MessageId,
            accepted,
            reasonCode,
            cancellationToken);
}
