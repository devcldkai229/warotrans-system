using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Runtime;

namespace WaroTrans.WorkflowExecution.Execution;

public sealed record HandoverStopScan(Guid ContainerId, string Barcode);

public sealed partial class JobExecutionEngine
{
    private HumanTaskOptions StopSettings => humanTasks?.Value ?? new HumanTaskOptions();

    public Task ConfirmHandoverStopAsync(
        Guid jobId, Guid stopId, Guid moveId, int version, IReadOnlyList<HandoverStopScan>? scans, Guid actor,
        CancellationToken cancellationToken) =>
        ConfirmStopAsync(jobId, stopId, moveId, version, scans, actor, null, cancellationToken);

    public Task ConfirmHandoverStopByRobotAsync(RobotInteractionConfirmed confirmation, CancellationToken cancellationToken)
    {
        if (!StopSettings.EnableHandoverStopButton || confirmation.HandoverStop is not { } stop)
            throw new ConflictException("This deployment does not accept handover stops from the robot button.", "handover_stop_button_unavailable");

        if (confirmation.RequestMessageId != StopArmId(stop.Id, stop.MoveId, stop.Version))
            throw new ConflictException("The button message does not match the armed handover.", "interaction_arm_changed");
        return ConfirmStopAsync(confirmation.JobId, stop.Id, stop.MoveId, stop.Version, null, null, confirmation, cancellationToken);
    }

    private async Task ConfirmStopAsync(
        Guid jobId, Guid stopId, Guid moveId, int version, IReadOnlyList<HandoverStopScan>? scans, Guid? actor,
        RobotInteractionConfirmed? button, CancellationToken cancellationToken)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await LoadJobAsync(jobId, cancellationToken);
        var task = job.JobTasks.SingleOrDefault(task => task.Id == stopId);
        if (task is null)
            throw new NotFoundException("The handover stop was not found on this Job.", "handover_stop_not_found");

        if (task.HandoverConfirmedAt is not null && task.HandoverClaimMoveId == moveId && version == task.HandoverVersion - 1)
        {
            if (button is null && task.HandoverClaimedBy == actor) return;
            if (button is not null && await db.HandoverConfirmations.AnyAsync(
                    confirmation => confirmation.SourceMessageId == button.MessageId && confirmation.ConfirmedByRobotId == button.RobotId
                        && confirmation.JobStepId == button.JobStepId && confirmation.JobStep.JobTask.JobId == jobId, cancellationToken))
                return;
        }

        var workflowSteps = await db.WorkflowSteps.AsNoTracking()
            .Where(step => step.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(step => step.Id, cancellationToken);
        var stop = StopHandover.Read(job, workflowSteps.ToDictionary(pair => pair.Key, pair => pair.Value.Config.OperationCode));
        if (stop is null || stop.StopTask.Id != stopId || stop.MoveId != moveId || task.HandoverVersion != version)
            throw new ConflictException("The handover stop changed. Refresh the queue.", "handover_stop_changed");

        var now = (clock ?? TimeProvider.System).GetUtcNow();
        var owner = stop.OwnerAt(now, StopSettings);
        if (owner is null || (button is null && owner != actor))
            throw new ConflictException("Claim this handover before operating it.", "handover_stop_claim_required");
        if (stop.ReadyAt is not { } readyAt || readyAt > now)
            throw new ConflictException("Wait until the robot reaches the handover stop.", "handover_robot_not_ready");
        if (task.HandoverBeganAt is null)
            throw new ConflictException("Begin the handover before confirming it.", "handover_stop_begin_required");

        if (button is not null)
        {
            var anchor = stop.Containers[0];
            if (AssignedRobot(job) != button.RobotId || anchor.Step.Id != button.JobStepId || anchor.ContainerId != button.ContainerId
                || stop.EndpointId != button.EndpointId || $"{stop.Action}_CONFIRM" != button.InteractionType)
                throw new ConflictException("The robot button does not match the current handover.", "interaction_not_current");
        }

        await EnsureNoBlockingHandoverIssuesAsync(jobId, stop.Containers.Select(item => item.ContainerId).ToArray(), cancellationToken);
        var barcodes = button is null
            ? await VerifyContainerScansAsync(stop.Containers.Select(item => item.ContainerId).ToArray(), scans, cancellationToken) : null;
        var type = stop.Action == "PICKUP" ? HandoverType.PICKUP : HandoverType.DROPOFF;
        var expectedStatus = type == HandoverType.PICKUP ? JobContainerStatus.ASSIGNED : JobContainerStatus.ONBOARD;
        var jobContainers = job.JobContainers.ToDictionary(container => container.ContainerId);
        if (stop.Containers.Any(item => jobContainers.GetValueOrDefault(item.ContainerId)?.Status != expectedStatus))
            throw new ConflictException("The custody of one or more containers has changed.", "handover_custody_changed");
        if (type == HandoverType.PICKUP)
            await EnsureRobotHasRoomAsync(job, cancellationToken, stop.Containers.Count);

        foreach (var item in stop.Containers)
        {
            EnsureNotClaimedByAnother(item.Step, owner, now);
            var definition = workflowSteps[item.Step.WorkflowStepId];
            if (item.Step.Status != JobStepStatus.WAITING)
            {
                item.Step.ResolvedInputs = inputResolver.Resolve(
                    item.Step.StepType,
                    definition.Config.OperationCode,
                    definition.InputBindings,
                    VariableContext(job),
                    CurrentMovementContextFactory.FromJobTaskContext(item.Task.ContextValues),
                    EarlierOutputs(job, workflowSteps));
                item.Step.StartedAt = now;
                item.Task.StartedAt ??= now;
            }

            if (GuidInput(item.Step, "containerId") != item.ContainerId || GuidInput(item.Step, "endpointId") != stop.EndpointId)
                throw new ConflictException("The workflow inputs no longer match the stop manifest.", "handover_stop_changed");

            var source = button is null
                ? HumanConfirmationSource.StaffApp(owner.Value, scannedBarcode: barcodes![item.ContainerId])
                : new HumanConfirmationSource(ConfirmationSource.ROBOT_BUTTON, RobotId: button.RobotId,
                    MessageId: item.Step.Id == button.JobStepId ? button.MessageId : null);
            RecordHandover(job, item.Step, jobContainers[item.ContainerId], type, source, now);
            CompleteHumanStep(job, item.Task, item.Step, definition, source, now);
        }

        task.HandoverClaimMoveId = moveId;
        task.HandoverConfirmedAt = now;
        task.HandoverVersion++;
        await SaveAndPublishAsync(cancellationToken, transaction);
        await db.Entry(job).ReloadAsync(CancellationToken.None);
        await AdvanceAsync(jobId, CancellationToken.None);
    }

    internal async Task<bool> TryArmBegunHandoverStopAsync(Guid jobId, CancellationToken cancellationToken)
    {
        if (!StopSettings.EnableHandoverStopButton) return false;
        var job = await LoadJobAsync(jobId, cancellationToken);
        var operations = await StopHandover.LoadOperationsAsync(db, [job.WorkflowId], cancellationToken);
        var stop = StopHandover.Read(job, operations);
        var now = (clock ?? TimeProvider.System).GetUtcNow();
        if (stop is not { ReadyAt: { } ready } || ready > now || stop.StopTask.HandoverBeganAt is null
            || stop.OwnerAt(now, StopSettings) is null || AssignedRobot(job) is not { } robotId)
            return false;

        var version = stop.StopTask.HandoverVersion;
        var requestId = StopArmId(stop.StopTask.Id, stop.MoveId, version);
        var anchor = stop.Containers[0];
        try
        {
            return await fleet.ArmHandoverStopButtonAsync(robotId, job.Id, anchor.Step.Id, $"{stop.Action}_CONFIRM", anchor.ContainerId,
                stop.EndpointId, requestId, new RobotHandoverStop(stop.StopTask.Id, stop.MoveId, version,
                    stop.Containers.Select(item => item.ContainerId).ToArray()), cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Could not arm the robot button for handover {HandoverStopId}", stop.StopTask.Id);
            return false;
        }
    }

    private static Guid StopArmId(Guid stopId, Guid moveId, int version)
    {
        var key = FormattableString.Invariant($"handover:{stopId:N}:{moveId:N}:{version}");
        return new Guid(SHA256.HashData(Encoding.UTF8.GetBytes(key)).AsSpan(0, 16));
    }

    private async Task<Dictionary<Guid, string>> VerifyContainerScansAsync(
        IReadOnlyCollection<Guid> ids, IReadOnlyList<HandoverStopScan>? scans, CancellationToken cancellationToken)
    {
        if (scans is null || scans.Count != ids.Count || scans.Any(scan => scan is null || string.IsNullOrWhiteSpace(scan.Barcode))
            || !scans.Select(scan => scan.ContainerId).ToHashSet().SetEquals(ids))
            throw new DomainValidationException("Scan each container of this handover once.", "handover_scan_manifest_mismatch");

        if (warehouse is null)
            throw new AppException("Barcode verification is unavailable.", 503, "handover_barcode_check_unavailable");

        var barcodes = (await warehouse.GetContainersAsync(ids, cancellationToken)).ToDictionary(item => item.Id, item => item.Barcode);
        foreach (var scan in scans)
        {
            if (!string.Equals(barcodes.GetValueOrDefault(scan.ContainerId), scan.Barcode.Trim(), StringComparison.OrdinalIgnoreCase))
                throw new DomainValidationException("A scanned barcode does not match its container.", "handover_barcode_mismatch");
        }
        return barcodes;
    }

    private async Task EnsureStepIsNotHeldByStopAsync(Job job, JobStep step, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!job.JobTasks.Any(task => task.HandoverClaimedBy is not null && task.HandoverConfirmedAt is null))
            return;

        var definitions = await db.WorkflowSteps.AsNoTracking()
            .Where(definition => definition.WorkflowTask.WorkflowId == job.WorkflowId && definition.StepType == StepType.HUMAN_INTERACTION)
            .Select(definition => new { definition.Id, definition.Config })
            .ToListAsync(cancellationToken);
        var stop = StopHandover.Read(job, definitions.ToDictionary(row => row.Id, row => row.Config.OperationCode));
        if (stop is not null && stop.OwnerAt(now, StopSettings) is not null && stop.Containers.Any(item => item.Step.Id == step.Id))
            throw new ConflictException("Use the handover stop to confirm all containers together.", "handover_stop_confirmation_required");
    }

    private static Guid? GuidInput(JobStep step, string key) =>
        step.ResolvedInputs.TryGetValue(key, out var value) && value.ValueKind == JsonValueKind.String && value.TryGetGuid(out var id)
            ? id : null;

    private async Task EnsureNoBlockingHandoverIssuesAsync(
        Guid jobId, IReadOnlyCollection<Guid> containerIds, CancellationToken cancellationToken)
    {
        if (issueReporter is not null && await issueReporter.HasBlockingHandoverIssueAsync(jobId, containerIds, cancellationToken))
            throw new ConflictException("Resolve the wrong or missing container issue before confirming.", "handover_issue_blocking");
    }
}
