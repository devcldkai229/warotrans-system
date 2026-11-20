using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Runtime;

namespace WaroTrans.WorkflowExecution.Execution;

public sealed record HandoverStopScan(Guid ContainerId, string Barcode);

public sealed partial class JobExecutionEngine
{
    private HumanTaskOptions StopSettings => humanTasks?.Value ?? new HumanTaskOptions();

    public async Task ConfirmHandoverStopAsync(
        Guid jobId, Guid stopId, Guid moveId, int version, IReadOnlyList<HandoverStopScan>? scans, Guid actor,
        CancellationToken cancellationToken)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await LoadJobAsync(jobId, cancellationToken);
        var task = job.JobTasks.SingleOrDefault(task => task.Id == stopId);
        if (task is null)
            throw new NotFoundException("The handover stop was not found on this Job.", "handover_stop_not_found");

        if (task.HandoverConfirmedAt is not null && task.HandoverClaimMoveId == moveId
            && task.HandoverClaimedBy == actor && version == task.HandoverVersion - 1)
            return;

        var workflowSteps = await db.WorkflowSteps.AsNoTracking()
            .Where(step => step.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(step => step.Id, cancellationToken);
        var stop = StopHandover.Read(job, workflowSteps.ToDictionary(pair => pair.Key, pair => pair.Value.Config.OperationCode));
        if (stop is null || stop.StopTask.Id != stopId || stop.MoveId != moveId || task.HandoverVersion != version)
            throw new ConflictException("The handover stop changed. Refresh the queue.", "handover_stop_changed");

        var now = (clock ?? TimeProvider.System).GetUtcNow();
        if (stop.OwnerAt(now, StopSettings) != actor)
            throw new ConflictException("Claim this handover before operating it.", "handover_stop_claim_required");
        if (stop.ReadyAt is not { } readyAt || readyAt > now)
            throw new ConflictException("Wait until the robot reaches the handover stop.", "handover_robot_not_ready");
        if (task.HandoverBeganAt is null)
            throw new ConflictException("Begin the handover before confirming it.", "handover_stop_begin_required");

        await EnsureNoBlockingHandoverIssuesAsync(jobId, stop.Containers.Select(item => item.ContainerId).ToArray(), cancellationToken);
        var barcodes = await VerifyContainerScansAsync(stop.Containers.Select(item => item.ContainerId).ToArray(), scans, cancellationToken);
        var type = stop.Action == "PICKUP" ? HandoverType.PICKUP : HandoverType.DROPOFF;
        var expectedStatus = type == HandoverType.PICKUP ? JobContainerStatus.ASSIGNED : JobContainerStatus.ONBOARD;
        var jobContainers = job.JobContainers.ToDictionary(container => container.ContainerId);
        if (stop.Containers.Any(item => jobContainers.GetValueOrDefault(item.ContainerId)?.Status != expectedStatus))
            throw new ConflictException("The custody of one or more containers has changed.", "handover_custody_changed");
        if (type == HandoverType.PICKUP)
            await EnsureRobotHasRoomAsync(job, cancellationToken, stop.Containers.Count);

        foreach (var item in stop.Containers)
        {
            EnsureNotClaimedByAnother(item.Step, actor, now);
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

            var source = HumanConfirmationSource.StaffApp(actor, scannedBarcode: barcodes[item.ContainerId]);
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
