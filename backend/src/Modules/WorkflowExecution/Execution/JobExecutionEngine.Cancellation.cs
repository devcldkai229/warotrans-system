using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Runtime;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// TRN-03: what a long-running request cancellation needs from the Jobs. Cancelling stops the remaining work; it never
/// rewrites what already happened (delivered stays delivered) and never treats cargo on a robot as returned: that cargo
/// is either delivered (resume) or unloaded by a person who scans it (<see cref="HandOverCancelledCargoAsync"/>).
/// </summary>
public sealed partial class JobExecutionEngine
{
    /// <summary>JobContainer.FailureCode of a container a person took off the robot after its request was cancelled.</summary>
    public const string CancelHandedOverCode = "cancel_handed_over";

    /// <summary>JobContainer.FailureCode of a container whose request detail was cancelled before it was picked up.</summary>
    public const string DetailCancelledCode = "detail_cancelled";

    /// <summary>What the cancellation needs to know about each Job of a request, read in one go.</summary>
    public async Task<IReadOnlyList<RequestJobCancellationView>> GetCancellationViewAsync(
        Guid transportRequestId, CancellationToken cancellationToken = default)
    {
        var jobIds = await db.JobContainers.AsNoTracking()
            .Where(c => c.TransportRequestId == transportRequestId)
            .Select(c => c.JobId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var jobs = await db.Jobs.AsNoTracking()
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .AsSplitQuery()
            .Where(j => jobIds.Contains(j.Id))
            .OrderBy(j => j.JobNo)
            .ToListAsync(cancellationToken);

        var views = new List<RequestJobCancellationView>();
        foreach (var job in jobs)
        {
            var robotId = AssignedRobot(job);
            var robot = robotId is { } rid ? await fleet.GetRobotAsync(rid, cancellationToken) : null;
            var state = await CancelRobotStateAsync(job, robot, cancellationToken);
            views.Add(new RequestJobCancellationView(
                job.Id,
                job.JobNo,
                job.Status.ToString(),
                job.FailureCode,
                robotId,
                robot?.Code,
                robot?.IsOnline ?? false,
                robot?.MotionHeld ?? false,
                job.JobContainers
                    .OrderBy(c => c.SequenceNo)
                    .Select(c => new RequestJobContainerView(
                        c.ContainerId, c.TransportRequestId, c.Status.ToString(), c.FailureCode, c.LoadedAt, c.DeliveredAt))
                    .ToList(),
                state.Phase,
                state.RecoveryEndpointId,
                state.RecoveryCode,
                state.Localized,
                state.Fresh,
                state.CanRecover));
        }

        return views;
    }

    /// <summary>
    /// A person took a container off a robot whose request was cancelled, scanned it and put it somewhere. The robot must
    /// be holding still (motion hold after the cancel STOP) or be offline: nobody unloads a moving robot. The container
    /// leaves the Job as CANCELLED with <see cref="CancelHandedOverCode"/>; where it went is posted to Warehouse by
    /// Transportation. When it was the last container on the robot the Job is cancelled and the robot's hold released.
    /// Scanning the same container again answers with the first result.
    /// </summary>
    public async Task<CancelHandoverResult> HandOverCancelledCargoAsync(
        Guid jobId,
        Guid transportRequestId,
        Guid containerId,
        string? scannedBarcode,
        Guid actor,
        string? note,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await LoadJobAsync(jobId, cancellationToken);
        var jobContainer = job.JobContainers.FirstOrDefault(c => c.ContainerId == containerId && c.TransportRequestId == transportRequestId)
            ?? throw new NotFoundException("This container is not carried by this Job for this request.", "container_not_in_job");

        if (jobContainer.Status == JobContainerStatus.CANCELLED && jobContainer.FailureCode == CancelHandedOverCode)
        {
            return new CancelHandoverResult(job.Id, containerId, AlreadyHandedOver: true, JobCancelled: job.Status == JobStatus.CANCELLED);
        }

        if (jobContainer.Status != JobContainerStatus.ONBOARD)
        {
            throw new ConflictException(
                $"This container is {jobContainer.Status}, not on the robot; there is nothing to unload.", "container_not_onboard");
        }

        if (job.Status is not (JobStatus.PAUSED or JobStatus.RECOVERY_REQUIRED))
        {
            throw new ConflictException(
                $"Job {job.JobNo} is {job.Status}. Cargo is unloaded by hand only while its Job is held (PAUSED / RECOVERY_REQUIRED).",
                "job_not_held");
        }

        if (string.IsNullOrWhiteSpace(scannedBarcode))
        {
            throw new DomainValidationException("Scan the container's label to confirm which one was taken off.", "scan_required");
        }

        await EnsureScannedBarcodeMatchesAsync(scannedBarcode, containerId, cancellationToken);

        var robotId = AssignedRobot(job);
        var robot = robotId is { } rid ? await fleet.GetRobotAsync(rid, cancellationToken) : null;
        if (robot is { IsOnline: true, MotionHeld: false })
        {
            throw new ConflictException(
                $"Robot {robot.Code} is not holding still. Stop it (it holds motion after a STOP) before taking cargo off.",
                "robot_not_stopped");
        }

        var now = DateTimeOffset.UtcNow;
        var stepIds = OrderedSteps(job).Select(x => x.Step.Id).ToList();
        var confirmed = (await db.HandoverConfirmations.AsNoTracking()
                .Where(h => stepIds.Contains(h.JobStepId))
                .Select(h => h.JobStepId)
                .ToListAsync(cancellationToken))
            .ToHashSet();
        // A step holds one confirmation; the container's own drop-off never ran, so it is normally the one used.
        if (HandoverStepFor(job, containerId, confirmed) is { } recordOn)
        {
            db.HandoverConfirmations.Add(new HandoverConfirmation
            {
                Id = Guid.NewGuid(),
                JobStepId = recordOn.Id,
                ContainerId = containerId,
                ConfirmedBy = actor,
                ConfirmationSource = ConfirmationSource.STAFF_APP,
                HandoverType = HandoverType.CANCEL_UNLOAD,
                ConfirmedAt = now,
                Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(),
                Evidence = new Dictionary<string, JsonElement>
                {
                    ["scannedBarcode"] = JsonSerializer.SerializeToElement(scannedBarcode.Trim()),
                    ["jobId"] = JsonSerializer.SerializeToElement(job.Id)
                }
            });
        }
        jobContainer.FailureCode = CancelHandedOverCode;
        jobContainer.FailureMessage = string.IsNullOrWhiteSpace(note) ? "Unloaded by hand after the request was cancelled." : Trim500(note);
        SetContainerStatus(job, jobContainer, JobContainerStatus.CANCELLED, now);

        var stillOnboard = job.JobContainers.Any(c => c.Status == JobContainerStatus.ONBOARD);
        if (stillOnboard)
        {
            await SaveAndPublishAsync(cancellationToken, transaction);
            return new CancelHandoverResult(job.Id, containerId, AlreadyHandedOver: false, JobCancelled: false);
        }

        await CancelLoadedJobAsync(job, "Request cancelled; the cargo was unloaded by hand.", transaction, cancellationToken);

        // The Job is over and nothing is left on the robot: its STOP hold has done its job.
        if (robot is { IsOnline: true, MotionHeld: true })
        {
            await fleet.ResumeRobotAsync(robot.Id, CancellationToken.None);
        }

        logger.LogInformation("Job {JobNo}: last container unloaded by hand after cancel; Job cancelled", job.JobNo);
        return new CancelHandoverResult(job.Id, containerId, AlreadyHandedOver: false, JobCancelled: true);
    }

    /// <summary>
    /// Cancels some containers of a running request before they are picked up; the rest of the Job goes on. Steps that
    /// only served those containers are SKIPPED (not CANCELLED: the Job did not fail, it has less to do). A container
    /// already on the robot or delivered is refused, and so is a stop the robot is already working at for them.
    /// When nothing is left to carry or deliver the whole Job is cancelled.
    /// </summary>
    public async Task<IReadOnlyList<ContainerCancelOutcome>> CancelContainersBeforePickupAsync(
        Guid jobId,
        Guid transportRequestId,
        IReadOnlyCollection<Guid> containerIds,
        string reason,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await LoadJobAsync(jobId, cancellationToken);
        var targets = job.JobContainers
            .Where(c => c.TransportRequestId == transportRequestId && containerIds.Contains(c.ContainerId))
            .ToList();
        if (targets.Count == 0)
        {
            return [];
        }

        var finished = targets.Where(c => c.Status is JobContainerStatus.CANCELLED or JobContainerStatus.FAILED).ToList();
        var open = targets.Except(finished).ToList();
        if (open.FirstOrDefault(c => c.Status is not (JobContainerStatus.PENDING or JobContainerStatus.ASSIGNED)) is { } picked)
        {
            throw new ConflictException(
                $"A container of this request is already {picked.Status}; only containers not picked up yet can be cancelled one by one. "
                + "Cancel the whole request to stop the robot.",
                "detail_already_picked_up");
        }

        if (open.Count == 0 || JobActionPolicy.StateReason(JobActionPolicy.Cancel, job.Status) is not null)
        {
            return targets.Select(c => new ContainerCancelOutcome(c.ContainerId, job.Id, ContainerCancelOutcome.AlreadyFinished)).ToList();
        }

        var cancelSet = open.Select(c => c.ContainerId).ToHashSet();
        var remaining = job.JobContainers
            .Where(c => c.Status is not (JobContainerStatus.FAILED or JobContainerStatus.CANCELLED) && !cancelSet.Contains(c.ContainerId))
            .ToList();

        if (remaining.Count == 0)
        {
            await CancelLoadedJobAsync(job, $"Transport request details cancelled: {reason}", transaction, cancellationToken);
            return open.Select(c => new ContainerCancelOutcome(c.ContainerId, job.Id, ContainerCancelOutcome.Cancelled))
                .Concat(finished.Select(c => new ContainerCancelOutcome(c.ContainerId, job.Id, ContainerCancelOutcome.AlreadyFinished)))
                .ToList();
        }

        var keys = await db.WorkflowSteps.AsNoTracking()
            .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(s => s.Id, s => s.StepKey, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var served = remaining.Select(c => c.ContainerId).ToHashSet();
        var toSkip = job.JobTasks.Where(t => ServesOnly(t, cancelSet, served)).ToList();
        if (toSkip.SelectMany(t => t.JobSteps).Any(s => s.Status == JobStepStatus.EXECUTING))
        {
            throw new ConflictException(
                "The robot is already driving to a stop for these containers. Cancel the whole request, or wait until it is there.",
                "detail_stop_in_progress");
        }

        foreach (var container in open)
        {
            container.FailureCode = DetailCancelledCode;
            container.FailureMessage = Trim500(reason);
            SetContainerStatus(job, container, JobContainerStatus.CANCELLED, now);
        }

        foreach (var task in toSkip)
        {
            foreach (var step in task.JobSteps.Where(s => s.Status is JobStepStatus.PENDING or JobStepStatus.READY
                         or JobStepStatus.WAITING or JobStepStatus.PAUSED))
            {
                step.ErrorCode = DetailCancelledCode;
                SetStepStatus(job, task, step, keys.GetValueOrDefault(step.WorkflowStepId, step.Id.ToString("N")), JobStepStatus.SKIPPED, now);
            }

            CompleteTaskIfDone(task);
        }

        await SaveAndPublishAsync(cancellationToken, transaction);
        logger.LogInformation("Job {JobNo}: {Count} container(s) cancelled before pickup", job.JobNo, open.Count);

        // A skipped step may be the one the Job was waiting at.
        if (job.Status == JobStatus.RUNNING)
        {
            await AdvanceAsync(job.Id, cancellationToken);
        }

        return open.Select(c => new ContainerCancelOutcome(c.ContainerId, job.Id, ContainerCancelOutcome.Cancelled))
            .Concat(finished.Select(c => new ContainerCancelOutcome(c.ContainerId, job.Id, ContainerCancelOutcome.AlreadyFinished)))
            .ToList();
    }

    /// <summary>
    /// Request cancelled while cargo is on the robot: containers of this Job still waiting to be picked up are not
    /// picked up any more, so resuming the Job only delivers what is already on board.
    /// </summary>
    private void SkipNotPickedUp(Job job, IReadOnlyDictionary<Guid, string> keys, string reason, DateTimeOffset now)
    {
        var notPicked = job.JobContainers
            .Where(c => c.Status is JobContainerStatus.PENDING or JobContainerStatus.ASSIGNED)
            .ToList();
        if (notPicked.Count == 0)
        {
            return;
        }

        var cancelSet = notPicked.Select(c => c.ContainerId).ToHashSet();
        var served = job.JobContainers
            .Where(c => c.Status is not (JobContainerStatus.FAILED or JobContainerStatus.CANCELLED) && !cancelSet.Contains(c.ContainerId))
            .Select(c => c.ContainerId)
            .ToHashSet();
        foreach (var container in notPicked)
        {
            container.FailureCode = DetailCancelledCode;
            container.FailureMessage = Trim500(reason);
            SetContainerStatus(job, container, JobContainerStatus.CANCELLED, now);
        }

        foreach (var task in job.JobTasks.Where(t => ServesOnly(t, cancelSet, served)))
        {
            foreach (var step in task.JobSteps.Where(s => s.Status is JobStepStatus.PENDING or JobStepStatus.READY
                         or JobStepStatus.WAITING or JobStepStatus.PAUSED))
            {
                step.ErrorCode = DetailCancelledCode;
                SetStepStatus(job, task, step, keys.GetValueOrDefault(step.WorkflowStepId, step.Id.ToString("N")), JobStepStatus.SKIPPED, now);
            }

            CompleteTaskIfDone(task);
        }
    }

    /// <summary>The task only works for containers that are being cancelled, and has not started.</summary>
    private static bool ServesOnly(JobTask task, IReadOnlySet<Guid> cancelled, IReadOnlySet<Guid> served)
    {
        if (task.ContextValues.TryGetValue("containerId", out var single) && single.ValueKind == JsonValueKind.String)
        {
            return cancelled.Contains(single.GetGuid());
        }

        if (!task.ContextValues.TryGetValue("containerIds", out var many) || many.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        var ids = many.EnumerateArray().Select(id => id.GetGuid()).ToList();
        return ids.Any(cancelled.Contains) && !ids.Any(served.Contains)
            && task.JobSteps.All(s => s.Status is JobStepStatus.PENDING or JobStepStatus.READY or JobStepStatus.SKIPPED);
    }

    /// <summary>
    /// The step the unload is recorded against: the container's own drop-off (never confirmed, it is still on board),
    /// else any step of the Job without a confirmation yet; null when every step already holds one.
    /// </summary>
    private static JobStep? HandoverStepFor(Job job, Guid containerId, IReadOnlySet<Guid> taken)
    {
        var free = OrderedSteps(job).Where(x => !taken.Contains(x.Step.Id)).ToList();
        var own = free
            .Where(x => x.Task.ContextValues.TryGetValue("containerId", out var id)
                        && id.ValueKind == JsonValueKind.String && id.GetGuid() == containerId)
            .Select(x => x.Step)
            .ToList();
        return own.LastOrDefault(s => s.StepType == StepType.HUMAN_INTERACTION)
            ?? own.LastOrDefault()
            ?? free.Select(x => x.Step).LastOrDefault(s => s.StepType == StepType.HUMAN_INTERACTION)
            ?? free.Select(x => x.Step).LastOrDefault();
    }

    private static string Trim500(string text)
    {
        var trimmed = text.Trim();
        return trimmed.Length > 500 ? trimmed[..500] : trimmed;
    }
}
