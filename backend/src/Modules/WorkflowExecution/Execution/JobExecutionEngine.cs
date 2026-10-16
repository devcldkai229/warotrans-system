using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Navigation.Contracts;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Runtime;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// Runs a provisioned Job: walks JobTasks / JobSteps in order and executes each step.
///
///   CHECK              evaluated immediately (Fleet / Navigation / Transportation contracts)
///   MOVE               NAVIGATE_TO_POSE through Fleet → step EXECUTING; finished by the robot RESULT
///                      (RobotCommandLifecycleJobStepHandler → AdvanceAsync)
///   HUMAN_INTERACTION  step WAITING; finished by ConfirmHumanStepAsync (Staff API)
///   WAIT               not supported in V1 → step FAILED
///
/// The engine is event driven: it advances until it reaches a step that waits for something
/// external, then returns. It never assigns robots itself except in StartAsync.
/// JSON columns have no EF value comparer, so dictionaries are always replaced, never mutated.
/// </summary>
public sealed class JobExecutionEngine(
    WorkflowExecutionDbContext db,
    IFleetModule fleet,
    INavigationModule navigation,
    ITransportRequestActivityQuery requestActivity,
    StepInputResolver inputResolver,
    IIntegrationEventPublisher events,
    ILogger<JobExecutionEngine> logger)
{
    public const string AssignedRobotKey = "assignedRobotId";

    private static readonly JobStatus[] ActiveJobStatuses =
        [JobStatus.ASSIGNED, JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.REASSIGNING, JobStatus.RECOVERY_REQUIRED];

    private readonly List<IIntegrationEvent> _pendingEvents = [];

    // ------------------------------------------------------------------ start

    /// <summary>Assigns a robot (given or best available on the Job's map) and starts executing.</summary>
    public async Task<Job> StartAsync(Guid jobId, Guid? robotId, CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);

        if (job.Status == JobStatus.RUNNING)
        {
            return job; // idempotent
        }

        if (job.Status is not (JobStatus.CREATED or JobStatus.QUEUED))
        {
            throw new ConflictException($"Job {job.JobNo} cannot be started from status {job.Status}.", "job_not_startable");
        }

        var busyRobots = await RobotsBusyWithOtherJobsAsync(job.Id, cancellationToken);
        RobotSnapshot robot;
        if (robotId is { } requested)
        {
            robot = await fleet.GetRobotAsync(requested, cancellationToken)
                ?? throw new NotFoundException($"Robot '{requested}' was not found.", "robot_not_found");
            EnsureRobotCanTakeJob(robot, job, busyRobots);
        }
        else
        {
            var candidates = await fleet.GetDispatchCandidatesAsync(job.MapVersionId, cancellationToken);
            robot = candidates.FirstOrDefault(r => !busyRobots.Contains(r.Id))
                ?? throw new ConflictException(
                    "No AVAILABLE robot on the Job's map version is free to take this Job.",
                    "no_robot_available");
        }

        var now = DateTimeOffset.UtcNow;
        job.ContextValues = new Dictionary<string, JsonElement>(job.ContextValues)
        {
            [AssignedRobotKey] = JsonSerializer.SerializeToElement(robot.Id)
        };
        job.Status = JobStatus.RUNNING;
        job.QueuedAt ??= now;
        job.StartedAt = now;
        foreach (var container in job.JobContainers.Where(c => c.Status == JobContainerStatus.PENDING))
        {
            SetContainerStatus(job, container, JobContainerStatus.ASSIGNED, now);
        }

        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), robot.Id, null));
        await SaveAndPublishAsync(cancellationToken);
        logger.LogInformation("Job {JobNo} started on robot {RobotCode}", job.JobNo, robot.Code);

        await AdvanceAsync(job.Id, cancellationToken);
        return job;
    }

    // ------------------------------------------------------------------ advance

    /// <summary>Executes steps in order until one has to wait for the robot or a person.</summary>
    public async Task AdvanceAsync(Guid jobId, CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        if (job.Status != JobStatus.RUNNING)
        {
            return;
        }

        var workflowSteps = await db.WorkflowSteps
            .AsNoTracking()
            .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(s => s.Id, cancellationToken);

        foreach (var (task, step) in OrderedSteps(job))
        {
            switch (step.Status)
            {
                case JobStepStatus.COMPLETED:
                    continue;
                case JobStepStatus.EXECUTING or JobStepStatus.WAITING or JobStepStatus.PAUSED:
                    return; // waiting for robot RESULT or Staff confirmation
                case JobStepStatus.FAILED or JobStepStatus.CANCELLED:
                    await FailJobAsync(job, task, step, workflowSteps[step.WorkflowStepId], cancellationToken);
                    return;
            }

            var finished = await ExecuteStepAsync(job, task, step, workflowSteps, cancellationToken);
            await SaveAndPublishAsync(cancellationToken);
            if (!finished)
            {
                return;
            }

            if (step.Status == JobStepStatus.FAILED)
            {
                await FailJobAsync(job, task, step, workflowSteps[step.WorkflowStepId], cancellationToken);
                return;
            }

            CompleteTaskIfDone(task);
        }

        await CompleteJobAsync(job, cancellationToken);
    }

    // ------------------------------------------------------------------ human confirmation

    /// <summary>
    /// Staff confirms a waiting HUMAN_INTERACTION step. For PICKUP/DROPOFF the scanned container must be the
    /// container of that step (V1 validates container identity, not quantities).
    /// </summary>
    public async Task<JobStep> ConfirmHumanStepAsync(
        Guid jobStepId,
        Guid? containerId,
        Guid confirmedBy,
        string? note,
        CancellationToken cancellationToken = default)
    {
        var stepRef = await db.JobSteps.AsNoTracking()
            .Where(s => s.Id == jobStepId)
            .Select(s => new { s.JobTask.JobId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"JobStep '{jobStepId}' was not found.", "job_step_not_found");

        var job = await LoadJobAsync(stepRef.JobId, cancellationToken);
        var (task, step) = OrderedSteps(job).First(x => x.Step.Id == jobStepId);
        var workflowStep = await db.WorkflowSteps.AsNoTracking().SingleAsync(s => s.Id == step.WorkflowStepId, cancellationToken);
        var operation = workflowStep.Config.OperationCode;

        if (job.Status != JobStatus.RUNNING)
        {
            throw new ConflictException($"Job {job.JobNo} is {job.Status}, not RUNNING.", "job_not_running");
        }

        if (step.StepType != StepType.HUMAN_INTERACTION || step.Status != JobStepStatus.WAITING)
        {
            throw new ConflictException(
                $"Step '{workflowStep.StepKey}' is {step.StepType}/{step.Status}; only a WAITING HUMAN_INTERACTION step can be confirmed.",
                "job_step_not_waiting");
        }

        var now = DateTimeOffset.UtcNow;
        var handoverType = operation switch
        {
            nameof(HumanActionCode.PICKUP_CONFIRM) => HandoverType.PICKUP,
            nameof(HumanActionCode.DROPOFF_CONFIRM) => HandoverType.DROPOFF,
            _ => (HandoverType?)null
        };

        if (handoverType is { } type)
        {
            var expected = step.ResolvedInputs.TryGetValue("containerId", out var c) ? c.GetGuid() : Guid.Empty;
            if (containerId is null || containerId.Value != expected)
            {
                throw new DomainValidationException(
                    $"Confirmed container '{containerId}' is not the container of this step ('{expected}').",
                    "handover_container_mismatch");
            }

            db.HandoverConfirmations.Add(new HandoverConfirmation
            {
                Id = Guid.NewGuid(),
                JobStepId = step.Id,
                ContainerId = expected,
                ConfirmedBy = confirmedBy,
                HandoverType = type,
                ConfirmedAt = now,
                Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim()
            });

            var jobContainer = job.JobContainers.First(jc => jc.ContainerId == expected);
            SetContainerStatus(
                job,
                jobContainer,
                type == HandoverType.PICKUP ? JobContainerStatus.ONBOARD : JobContainerStatus.DELIVERED,
                now);
        }

        step.OutputValues = new Dictionary<string, JsonElement>
        {
            ["confirmed"] = JsonSerializer.SerializeToElement(true),
            ["confirmedBy"] = JsonSerializer.SerializeToElement(confirmedBy),
            ["confirmedAt"] = JsonSerializer.SerializeToElement(now),
            ["note"] = JsonSerializer.SerializeToElement(note ?? string.Empty)
        };
        SetStepStatus(job, task, step, workflowStep.StepKey, JobStepStatus.COMPLETED, now);
        CompleteTaskIfDone(task);
        await SaveAndPublishAsync(cancellationToken);

        await AdvanceAsync(job.Id, cancellationToken);
        return step;
    }

    // ------------------------------------------------------------------ step execution

    /// <returns>true when the step finished now (COMPLETED or FAILED); false when it waits.</returns>
    private async Task<bool> ExecuteStepAsync(
        Job job,
        JobTask task,
        JobStep step,
        IReadOnlyDictionary<Guid, WorkflowStep> workflowSteps,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var workflowStep = workflowSteps[step.WorkflowStepId];
        var operation = workflowStep.Config.OperationCode;

        if (task.Status == JobTaskStatus.PENDING)
        {
            task.Status = JobTaskStatus.RUNNING;
            task.StartedAt = now;
        }

        try
        {
            step.ResolvedInputs = inputResolver.Resolve(
                step.StepType,
                operation,
                workflowStep.InputBindings,
                VariableContext(job),
                CurrentMovementContextFactory.FromJobTaskContext(task.ContextValues),
                EarlierOutputs(job, workflowSteps));
        }
        catch (AppException ex)
        {
            Fail(job, task, step, workflowStep.StepKey, ex.Code ?? "input_resolution_failed", ex.Message, now);
            return true;
        }

        step.StartedAt = now;
        switch (step.StepType)
        {
            case StepType.CHECK:
                var (passed, outputs, reason) = await EvaluateCheckAsync(job, operation, step.ResolvedInputs, cancellationToken);
                step.OutputValues = outputs;
                if (passed)
                {
                    SetStepStatus(job, task, step, workflowStep.StepKey, JobStepStatus.COMPLETED, now);
                }
                else
                {
                    Fail(job, task, step, workflowStep.StepKey, $"check_failed_{operation.ToLowerInvariant()}", reason, now);
                }

                return true;

            case StepType.MOVE:
                return await StartMoveAsync(job, task, step, workflowStep.StepKey, cancellationToken);

            case StepType.HUMAN_INTERACTION:
                SetStepStatus(job, task, step, workflowStep.StepKey, JobStepStatus.WAITING, now);
                return false;

            default:
                Fail(job, task, step, workflowStep.StepKey, "step_type_not_supported",
                    $"{step.StepType}.{operation} is not executable in V1.", now);
                return true;
        }
    }

    private async Task<bool> StartMoveAsync(Job job, JobTask task, JobStep step, string stepKey, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var robotId = step.ResolvedInputs["robotId"].GetGuid();
        var endpointId = step.ResolvedInputs["targetEndpointId"].GetGuid();
        var pose = await navigation.GetEndpointPoseAsync(endpointId, cancellationToken);
        if (pose is null || !pose.IsEnabled || pose.MapVersionId != job.MapVersionId)
        {
            Fail(job, task, step, stepKey, "endpoint_unavailable",
                $"Endpoint '{endpointId}' is missing, disabled or not on the Job's map.", now);
            return true;
        }

        step.TargetEndpointId = endpointId;
        SetStepStatus(job, task, step, stepKey, JobStepStatus.EXECUTING, now);
        // Persist EXECUTING before the command leaves: a fast ACK/RESULT must find the step.
        await SaveAndPublishAsync(cancellationToken);

        try
        {
            var commandId = await fleet.NavigateAsync(robotId, pose.X, pose.Y, pose.Yaw, job.Id, step.Id, cancellationToken);
            step.OutputValues = new Dictionary<string, JsonElement>
            {
                ["startedAt"] = JsonSerializer.SerializeToElement(now),
                ["robotCommandId"] = JsonSerializer.SerializeToElement(commandId)
            };
            logger.LogInformation("Job {JobNo} {StepKey} → robot command {CommandId} to {Endpoint}", job.JobNo, stepKey, commandId, pose.Code);
            return false;
        }
        catch (AppException ex)
        {
            Fail(job, task, step, stepKey, ex.Code ?? "navigate_rejected", ex.Message, DateTimeOffset.UtcNow);
            return true;
        }
    }

    private async Task<(bool Passed, Dictionary<string, JsonElement> Outputs, string Reason)> EvaluateCheckAsync(
        Job job,
        string operation,
        IReadOnlyDictionary<string, JsonElement> inputs,
        CancellationToken cancellationToken)
    {
        var outputs = new Dictionary<string, JsonElement>
        {
            ["checkedAt"] = JsonSerializer.SerializeToElement(DateTimeOffset.UtcNow)
        };
        bool passed;
        string reason;

        switch (operation)
        {
            case nameof(CheckConditionCode.ROBOT_READY):
            {
                var robot = await fleet.GetRobotAsync(inputs["robotId"].GetGuid(), cancellationToken);
                passed = robot is { IsEnabled: true, IsOnline: true, LocalizationStatus: LocalizationStatus.LOCALIZED }
                         && robot.Status is RobotStatus.AVAILABLE or RobotStatus.RESERVED or RobotStatus.EXECUTING;
                reason = robot is null ? "robot_not_found"
                    : passed ? "ready"
                    : $"online={robot.IsOnline} enabled={robot.IsEnabled} localization={robot.LocalizationStatus} status={robot.Status}";
                outputs["robotStatus"] = JsonSerializer.SerializeToElement(robot?.Status.ToString() ?? "UNKNOWN");
                break;
            }

            case nameof(CheckConditionCode.BATTERY_MIN):
            {
                var robot = await fleet.GetRobotAsync(inputs["robotId"].GetGuid(), cancellationToken);
                var required = inputs["minimumBatteryPercent"].GetDecimal();
                var actual = robot?.BatteryPercent ?? 0m;
                passed = robot is not null && actual >= required;
                reason = passed ? "battery_ok" : $"battery {actual}% < required {required}%";
                outputs["actualBatteryPercent"] = JsonSerializer.SerializeToElement(actual);
                outputs["requiredBatteryPercent"] = JsonSerializer.SerializeToElement(required);
                break;
            }

            case nameof(CheckConditionCode.ENDPOINT_AVAILABLE):
            {
                var pose = await navigation.GetEndpointPoseAsync(inputs["endpointId"].GetGuid(), cancellationToken);
                passed = pose is { IsEnabled: true } && pose.MapVersionId == job.MapVersionId;
                reason = pose is null ? "endpoint_not_found" : passed ? "available" : "endpoint_disabled_or_other_map";
                outputs["endpointStatus"] = JsonSerializer.SerializeToElement(passed ? "AVAILABLE" : "UNAVAILABLE");
                break;
            }

            case nameof(CheckConditionCode.REQUEST_ACTIVE):
            {
                var status = await requestActivity.GetStatusAsync(inputs["transportRequestId"].GetGuid(), cancellationToken);
                passed = ITransportRequestActivityQuery.IsActive(status);
                reason = status is null ? "request_not_found" : passed ? "active" : $"request {status}";
                outputs["requestStatus"] = JsonSerializer.SerializeToElement(status ?? "NOT_FOUND");
                break;
            }

            default:
                passed = false;
                reason = $"{operation} is not evaluated in V1";
                break;
        }

        outputs["passed"] = JsonSerializer.SerializeToElement(passed);
        outputs["reason"] = JsonSerializer.SerializeToElement(reason);
        return (passed, outputs, reason);
    }

    // ------------------------------------------------------------------ job / task outcome

    private async Task FailJobAsync(Job job, JobTask task, JobStep step, WorkflowStep workflowStep, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        task.Status = JobTaskStatus.FAILED;
        task.CompletedAt ??= now;
        task.FailureCode = step.ErrorCode;

        // OnFailure policy. V1 has no automatic reassignment / operator resume: the Job stops in that state.
        job.Status = workflowStep.OnFailure switch
        {
            StepFailurePolicy.PAUSE_FOR_OPERATOR => JobStatus.PAUSED,
            StepFailurePolicy.REQUEST_REASSIGN => JobStatus.REASSIGNING,
            _ => JobStatus.FAILED
        };
        job.FailureCode = step.ErrorCode;
        job.FailureMessage = $"{workflowStep.StepKey}: {step.ErrorMessage}";

        if (job.Status == JobStatus.FAILED)
        {
            job.CompletedAt = now;
            foreach (var container in job.JobContainers.Where(c => c.Status is not (JobContainerStatus.DELIVERED or JobContainerStatus.FAILED)))
            {
                SetContainerStatus(job, container, JobContainerStatus.FAILED, now);
            }
        }

        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), AssignedRobot(job), job.FailureCode));
        await SaveAndPublishAsync(cancellationToken);
        logger.LogWarning("Job {JobNo} → {Status} at {StepKey}: {Error}", job.JobNo, job.Status, workflowStep.StepKey, step.ErrorMessage);
    }

    private async Task CompleteJobAsync(Job job, CancellationToken cancellationToken)
    {
        if (job.Status == JobStatus.COMPLETED)
        {
            return;
        }

        job.Status = JobStatus.COMPLETED;
        job.CompletedAt = DateTimeOffset.UtcNow;
        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), AssignedRobot(job), null));
        await SaveAndPublishAsync(cancellationToken);
        logger.LogInformation("Job {JobNo} COMPLETED", job.JobNo);
    }

    private static void CompleteTaskIfDone(JobTask task)
    {
        if (task.Status != JobTaskStatus.COMPLETED && task.JobSteps.All(s => s.Status == JobStepStatus.COMPLETED))
        {
            task.Status = JobTaskStatus.COMPLETED;
            task.CompletedAt = DateTimeOffset.UtcNow;
        }
    }

    // ------------------------------------------------------------------ helpers

    private void Fail(Job job, JobTask task, JobStep step, string stepKey, string code, string message, DateTimeOffset now)
    {
        step.ErrorCode = code;
        step.ErrorMessage = message;
        SetStepStatus(job, task, step, stepKey, JobStepStatus.FAILED, now);
    }

    private void SetStepStatus(Job job, JobTask task, JobStep step, string stepKey, JobStepStatus status, DateTimeOffset now)
    {
        step.Status = status;
        if (status is JobStepStatus.COMPLETED or JobStepStatus.FAILED or JobStepStatus.CANCELLED)
        {
            step.CompletedAt = now;
        }

        _pendingEvents.Add(new JobStepStatusChanged(job.Id, task.Id, step.Id, stepKey, status.ToString(), step.ErrorCode));
    }

    private void SetContainerStatus(Job job, JobContainer container, JobContainerStatus status, DateTimeOffset now)
    {
        container.Status = status;
        container.UpdatedAt = now;
        if (status == JobContainerStatus.ONBOARD)
        {
            container.LoadedAt = now;
        }
        else if (status == JobContainerStatus.DELIVERED)
        {
            container.DeliveredAt = now;
        }

        _pendingEvents.Add(new JobContainerStatusChanged(job.Id, container.TransportRequestId, container.ContainerId, status.ToString()));
    }

    private async Task SaveAndPublishAsync(CancellationToken cancellationToken)
    {
        await db.SaveChangesAsync(cancellationToken);
        var toPublish = _pendingEvents.ToList();
        _pendingEvents.Clear();
        foreach (var integrationEvent in toPublish)
        {
            switch (integrationEvent)
            {
                case JobContainerStatusChanged e: await events.PublishAsync(e, cancellationToken); break;
                case JobStatusChanged e: await events.PublishAsync(e, cancellationToken); break;
                case JobStepStatusChanged e: await events.PublishAsync(e, cancellationToken); break;
            }
        }
    }

    private async Task<Job> LoadJobAsync(Guid jobId, CancellationToken cancellationToken) =>
        await db.Jobs
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .AsSplitQuery()
            .FirstOrDefaultAsync(j => j.Id == jobId, cancellationToken)
        ?? throw new NotFoundException($"Job '{jobId}' was not found.", "job_not_found");

    private static IEnumerable<(JobTask Task, JobStep Step)> OrderedSteps(Job job) =>
        job.JobTasks
            .OrderBy(t => t.SequenceNo)
            .SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo).Select(s => (t, s)));

    private static Dictionary<string, JsonElement> VariableContext(Job job)
    {
        var context = new Dictionary<string, JsonElement>(job.ContextValues, StringComparer.Ordinal);
        context.TryAdd("jobId", JsonSerializer.SerializeToElement(job.Id));
        return context;
    }

    /// <summary>Outputs of completed steps by StepKey; later steps win (closest stop / container).</summary>
    private static IReadOnlyDictionary<string, IReadOnlyDictionary<string, JsonElement>> EarlierOutputs(
        Job job,
        IReadOnlyDictionary<Guid, WorkflowStep> workflowSteps)
    {
        var outputs = new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>(StringComparer.Ordinal);
        foreach (var (_, step) in OrderedSteps(job).Where(x => x.Step.Status == JobStepStatus.COMPLETED))
        {
            outputs[workflowSteps[step.WorkflowStepId].StepKey] = step.OutputValues;
        }

        return outputs;
    }

    private static Guid? AssignedRobot(Job job) =>
        job.ContextValues.TryGetValue(AssignedRobotKey, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetGuid()
            : null;

    private async Task<HashSet<Guid>> RobotsBusyWithOtherJobsAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var active = await db.Jobs.AsNoTracking()
            .Where(j => j.Id != jobId && ActiveJobStatuses.Contains(j.Status))
            .ToListAsync(cancellationToken);
        return active.Select(AssignedRobot).OfType<Guid>().ToHashSet();
    }

    private static void EnsureRobotCanTakeJob(RobotSnapshot robot, Job job, HashSet<Guid> busyRobots)
    {
        if (robot.CurrentMapVersionId != job.MapVersionId)
        {
            throw new DomainValidationException(
                $"Robot {robot.Code} is on another map version than the Job.", "robot_map_mismatch");
        }

        if (!robot.IsEnabled || !robot.IsOnline || robot.Status != RobotStatus.AVAILABLE)
        {
            throw new ConflictException(
                $"Robot {robot.Code} is not available (online={robot.IsOnline}, enabled={robot.IsEnabled}, status={robot.Status}).",
                "robot_not_available");
        }

        if (busyRobots.Contains(robot.Id))
        {
            throw new ConflictException($"Robot {robot.Code} is already running another Job.", "robot_assigned_to_other_job");
        }
    }
}
