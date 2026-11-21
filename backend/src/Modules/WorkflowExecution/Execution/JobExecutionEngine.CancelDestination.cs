using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Traffic;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// TRN-03 cancellation destination policy: where the robot of a cancelled Job goes. A robot carrying cargo is not left
/// standing in a lane: it may take the cargo to a recovery point (a wait / queue point), where it holds still to be
/// unloaded by scan. The leg is the Job's own open MOVE with another goal, so traffic treats it like any MOVE.
/// </summary>
public sealed partial class JobExecutionEngine
{
    /// <summary>MOVE output: drive to this recovery endpoint instead of the step's own target (cancellation).</summary>
    public const string CancelRecoveryToKey = "cancelRecoveryToEndpointId";

    /// <summary>MOVE output: when the robot reached the recovery point (the MOVE is not done, the Job is held).</summary>
    public const string CancelRecoveryArrivedKey = "cancelRecoveryArrivedAt";

    /// <summary>Job context: the recovery point the held robot stands at.</summary>
    public const string CancelRecoveryAtKey = "cancelRecoveryEndpointId";

    /// <summary>Telemetry older than this does not count as knowing where the robot is now.</summary>
    private const double CancelFreshPoseSeconds = 10;

    /// <summary>The recovery endpoint a MOVE is redirected to, if any.</summary>
    public static Guid? RecoveryTarget(JobStep step) =>
        step.OutputValues.TryGetValue(CancelRecoveryToKey, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetGuid()
            : null;

    private static Guid? RecoveryHeldAt(Job job) =>
        job.ContextValues.TryGetValue(CancelRecoveryAtKey, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetGuid()
            : null;

    /// <summary>
    /// The robot's place in its trip, read from the steps: the current stop's MOVE done means it stands at that stop.
    /// <paramref name="canRecover"/> says whether a recovery leg can be driven now (an open MOVE comes next).
    /// </summary>
    internal static string CancelPhase(Job job, bool onboard, out bool canRecover)
    {
        canRecover = false;
        if (job.Status is JobStatus.COMPLETED or JobStatus.FAILED or JobStatus.CANCELLED)
        {
            return CancelRobotPhases.Done;
        }

        if (AssignedRobot(job) is null || job.Status is JobStatus.CREATED or JobStatus.QUEUED)
        {
            return CancelRobotPhases.NotStarted;
        }

        var ordered = OrderedSteps(job).ToList();
        if (job.Status == JobStatus.RUNNING && ordered.Any(x => x.Step.StepType == StepType.MOVE && RecoveryTarget(x.Step) is not null
                                                              && x.Step.Status is not (JobStepStatus.COMPLETED or JobStepStatus.FAILED or JobStepStatus.CANCELLED)))
        {
            return CancelRobotPhases.ToRecovery;
        }

        if (job.Status != JobStatus.RUNNING && RecoveryHeldAt(job) is not null)
        {
            return CancelRobotPhases.AtRecovery;
        }

        var open = ordered.Where(x => x.Step.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED or JobStepStatus.CANCELLED)).ToList();
        if (open.Count == 0)
        {
            return CancelRobotPhases.Done;
        }

        var current = open[0];
        var action = current.Task.ContextValues.TryGetValue("stopAction", out var a) && a.ValueKind == JsonValueKind.String ? a.GetString() : null;
        var stopNo = current.Task.ContextValues.TryGetValue("stopSequenceNo", out var n) ? n.GetRawText() : null;
        var atStop = stopNo is not null && ordered.Any(x =>
            x.Step.StepType == StepType.MOVE && x.Step.Status == JobStepStatus.COMPLETED
            && x.Task.ContextValues.TryGetValue("stopSequenceNo", out var other) && other.GetRawText() == stopNo);

        string phase;
        if (atStop && action == "DROPOFF")
        {
            phase = CancelRobotPhases.AtDropoff;
        }
        else if (atStop && action == "PICKUP")
        {
            phase = CancelRobotPhases.AtPickup;
        }
        else if (onboard)
        {
            phase = CancelRobotPhases.InTransit;
        }
        else
        {
            var moved = ordered.Any(x => x.Step.StepType == StepType.MOVE
                                         && (x.Step.Status == JobStepStatus.COMPLETED || x.Step.StartedAt is not null
                                             || x.Step.OutputValues.ContainsKey(RobotCommandIdKey)
                                             || x.Step.OutputValues.ContainsKey(SupersededCommandIdsKey)));
            phase = moved ? CancelRobotPhases.ToPickup : CancelRobotPhases.NotStarted;
        }

        canRecover = onboard && phase != CancelRobotPhases.AtDropoff && RecoveryCarrier(open) is not null;
        return phase;
    }

    /// <summary>
    /// The open MOVE a recovery leg is driven with: the next MOVE, with nothing a person still has to confirm before it
    /// (only the checks of its own stop). Null when the robot stands where someone has to act first.
    /// </summary>
    private static (JobTask Task, JobStep Step)? RecoveryCarrier(IReadOnlyList<(JobTask Task, JobStep Step)> open)
    {
        var index = -1;
        for (var i = 0; i < open.Count; i++)
        {
            if (open[i].Step.StepType == StepType.MOVE)
            {
                index = i;
                break;
            }
        }

        if (index < 0)
        {
            return null;
        }

        var carrier = open[index];
        for (var i = 0; i < index; i++)
        {
            if (open[i].Task.Id != carrier.Task.Id || open[i].Step.StepType == StepType.HUMAN_INTERACTION)
            {
                return null;
            }
        }

        return carrier;
    }

    /// <summary>
    /// The held robot takes its cancelled cargo to <paramref name="endpointId"/> (a recovery point). Idempotent: sending
    /// it again to the same point while it drives there answers with the Job. Refused at a drop-off (the containers are
    /// reconciled there first), in Active traffic mode (its route grants are per destination) and for a robot that
    /// cannot drive safely (ResumeAsync checks localization, telemetry and readiness).
    /// </summary>
    public async Task<Job> SendCancelledCargoToRecoveryAsync(Guid jobId, Guid endpointId, Guid actor, CancellationToken cancellationToken = default)
    {
        await using (var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken))
        {
            var job = await LoadJobAsync(jobId, cancellationToken);
            if (job.Status == JobStatus.RUNNING && OrderedSteps(job).Any(x => RecoveryTarget(x.Step) == endpointId))
            {
                if (transaction is not null)
                {
                    await transaction.CommitAsync(cancellationToken);
                }

                return job;
            }

            if (job.Status != JobStatus.PAUSED || job.FailureCode != CargoOnboardCancelCode)
            {
                throw new ConflictException(
                    $"Job {job.JobNo} is {job.Status}; only a Job held by a request cancel with cargo on board can be sent to a recovery point.",
                    "job_not_held_for_cancel");
            }

            var onboard = job.JobContainers.Any(c => c.Status == JobContainerStatus.ONBOARD);
            if (!onboard)
            {
                throw new ConflictException("Nothing is on the robot any more.", "no_cargo_onboard");
            }

            if ((trafficOptions?.Value.Mode ?? TrafficCoordinatorMode.Shadow) == TrafficCoordinatorMode.Active && segmentedTraffic is not null)
            {
                throw new ConflictException(
                    "Active traffic mode grants routes per destination: deliver the cargo or unload it where the robot stands.",
                    "recovery_not_supported_in_traffic_mode");
            }

            var phase = CancelPhase(job, onboard, out var canRecover);
            if (phase == CancelRobotPhases.AtDropoff)
            {
                throw new ConflictException(
                    "The robot is at its drop-off: confirm the delivery there or unload the containers by scan first.",
                    "at_dropoff_reconcile_first");
            }

            var open = OrderedSteps(job)
                .Where(x => x.Step.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED or JobStepStatus.CANCELLED))
                .ToList();
            if (!canRecover || RecoveryCarrier(open) is not { } carrier)
            {
                throw new ConflictException(
                    "The robot stands at a stop where a person still has to act: unload it there by scan.",
                    "recovery_needs_move");
            }

            var pose = await navigation.GetEndpointPoseAsync(endpointId, cancellationToken);
            if (pose is not { IsEnabled: true } || pose.MapVersionId != job.MapVersionId)
            {
                throw new DomainValidationException("That recovery point is disabled or on another map.", "endpoint_invalid");
            }

            var outputs = new Dictionary<string, JsonElement>(carrier.Step.OutputValues)
            {
                [CancelRecoveryToKey] = JsonSerializer.SerializeToElement(endpointId)
            };
            outputs.Remove(CancelRecoveryArrivedKey);
            carrier.Step.OutputValues = outputs;
            var context = new Dictionary<string, JsonElement>(job.ContextValues);
            context.Remove(CancelRecoveryAtKey);
            job.ContextValues = context;
            await SaveAndPublishAsync(cancellationToken, transaction);
            logger.LogInformation("Job {JobNo}: cancelled cargo goes to recovery point {Code}", job.JobNo, pose.Code);
        }

        try
        {
            db.ChangeTracker.Clear();
            return await ResumeAsync(jobId, null, cancellationToken, actor);
        }
        catch (AppException)
        {
            // The robot could not go: the Job stays held, and a later "continue delivery" must not drive to the point.
            db.ChangeTracker.Clear();
            await ClearRecoveryLegAsync(jobId, keepHeldAt: true, CancellationToken.None);
            throw;
        }
    }

    /// <summary>
    /// Continue delivery of cancelled cargo: the Job runs again to its own drop-offs (also from a recovery point).
    /// A robot already driving its cargo to a recovery point is not turned around here: it is held there first.
    /// </summary>
    public async Task<Job> ContinueCancelledDeliveryAsync(Guid jobId, Guid actor, CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        if (job.Status == JobStatus.RUNNING)
        {
            if (CancelPhase(job, job.JobContainers.Any(c => c.Status == JobContainerStatus.ONBOARD), out _) == CancelRobotPhases.ToRecovery)
            {
                throw new ConflictException(
                    "The robot is driving its cargo to a recovery point. Continue the delivery once it is there.",
                    "robot_driving_to_recovery");
            }

            return job; // already delivering
        }

        db.ChangeTracker.Clear();
        await ClearRecoveryLegAsync(jobId, keepHeldAt: false, cancellationToken);
        db.ChangeTracker.Clear();
        return await ResumeAsync(jobId, null, cancellationToken, actor);
    }

    private async Task ClearRecoveryLegAsync(Guid jobId, bool keepHeldAt, CancellationToken cancellationToken)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await LoadJobAsync(jobId, cancellationToken);
        foreach (var (_, step) in OrderedSteps(job).Where(x => x.Step.OutputValues.ContainsKey(CancelRecoveryToKey)
                                                               || x.Step.OutputValues.ContainsKey(CancelRecoveryArrivedKey)))
        {
            var outputs = new Dictionary<string, JsonElement>(step.OutputValues);
            outputs.Remove(CancelRecoveryToKey);
            outputs.Remove(CancelRecoveryArrivedKey);
            step.OutputValues = outputs;
        }

        if (!keepHeldAt && job.ContextValues.ContainsKey(CancelRecoveryAtKey))
        {
            var context = new Dictionary<string, JsonElement>(job.ContextValues);
            context.Remove(CancelRecoveryAtKey);
            job.ContextValues = context;
        }

        await SaveAndPublishAsync(cancellationToken, transaction);
    }

    /// <summary>
    /// The robot reached its recovery point: the Job is held again (STOP PAUSE) so the cargo is unloaded from a robot
    /// that holds still. The MOVE is reopened towards its own target, for a later "continue delivery".
    /// </summary>
    public async Task HoldAtRecoveryAsync(Guid jobId, Guid stepId, CancellationToken cancellationToken = default)
    {
        await using var transaction = await JobWriteLock.AcquireAsync(db, jobId, cancellationToken);
        var job = await LoadJobAsync(jobId, cancellationToken);
        var row = OrderedSteps(job).FirstOrDefault(x => x.Step.Id == stepId);
        if (job.Status != JobStatus.RUNNING || row.Step is null || RecoveryTarget(row.Step) is not { } endpointId)
        {
            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }

            return;
        }

        var (task, step) = row;
        var stepKey = await db.WorkflowSteps.AsNoTracking()
            .Where(w => w.Id == step.WorkflowStepId)
            .Select(w => w.StepKey)
            .FirstOrDefaultAsync(cancellationToken) ?? step.Id.ToString("N");
        var now = DateTimeOffset.UtcNow;
        ReopenStep(job, task, step, stepKey, now);
        step.TargetEndpointId = step.ResolvedInputs.TryGetValue("targetEndpointId", out var target) && target.ValueKind == JsonValueKind.String
            ? target.GetGuid()
            : step.TargetEndpointId;

        var pose = await navigation.GetEndpointPoseAsync(endpointId, cancellationToken);
        var robotId = AssignedRobot(job);
        if (robotId is { } rid)
        {
            await fleet.StopRobotAsync(rid, "PAUSE", $"At recovery point {pose?.Code}: unload Job {job.JobNo} by scan", cancellationToken);
        }

        job.ContextValues = new Dictionary<string, JsonElement>(job.ContextValues)
        {
            [CancelRecoveryAtKey] = JsonSerializer.SerializeToElement(endpointId)
        };
        job.Status = JobStatus.PAUSED;
        job.FailureCode = CargoOnboardCancelCode;
        job.FailureMessage =
            $"The request was cancelled; the robot holds still at recovery point {pose?.Code ?? endpointId.ToString()} with its cargo. "
            + "Unload each container by scan, or continue the delivery.";
        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), robotId, job.FailureCode));
        await SaveAndPublishAsync(cancellationToken, transaction);
        logger.LogInformation("Job {JobNo}: robot holds at recovery point {Code} for unloading", job.JobNo, pose?.Code);
    }

    private async Task<(string Phase, bool CanRecover, Guid? RecoveryEndpointId, string? RecoveryCode, bool Localized, bool Fresh)> CancelRobotStateAsync(
        Job job, WaroTrans.Fleet.Contracts.RobotSnapshot? robot, CancellationToken cancellationToken)
    {
        var onboard = job.JobContainers.Any(c => c.Status == JobContainerStatus.ONBOARD);
        var phase = CancelPhase(job, onboard, out var canRecover);
        var recoveryId = RecoveryHeldAt(job)
                         ?? OrderedSteps(job).Select(x => RecoveryTarget(x.Step)).FirstOrDefault(id => id is not null);
        string? code = null;
        if (recoveryId is { } id && phase is CancelRobotPhases.AtRecovery or CancelRobotPhases.ToRecovery)
        {
            code = (await navigation.GetEndpointPoseAsync(id, cancellationToken))?.Code;
        }

        var localized = robot?.LocalizationStatus == LocalizationStatus.LOCALIZED;
        var fresh = robot?.LastTelemetryAt is { } seen && (DateTimeOffset.UtcNow - seen).TotalSeconds <= CancelFreshPoseSeconds;
        return (phase, canRecover, phase is CancelRobotPhases.AtRecovery or CancelRobotPhases.ToRecovery ? recoveryId : null, code, localized, fresh);
    }
}
