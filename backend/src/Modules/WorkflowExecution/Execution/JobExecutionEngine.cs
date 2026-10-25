using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Fleet.Traffic.StationPolicies;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Traffic;
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
///   HUMAN_INTERACTION  step WAITING; finished by ConfirmHumanStepAsync (Staff App or robot button)
///   WAIT               not supported in V1 → step FAILED
///
/// The engine is event driven: it advances until it reaches a step that waits for something
/// external, then returns. It never assigns robots itself except in StartAsync.
/// JSON columns have no EF value comparer, so dictionaries are always replaced, never mutated.
/// After a PICKUP/DROPOFF WAITING step is committed, the engine arms the assigned robot via
/// <see cref="IFleetModule.RequestHumanInteractionAsync"/>.
/// </summary>
public sealed class JobExecutionEngine(
    WorkflowExecutionDbContext db,
    IFleetModule fleet,
    INavigationModule navigation,
    ITransportRequestActivityQuery requestActivity,
    StepInputResolver inputResolver,
    IIntegrationEventPublisher events,
    ILogger<JobExecutionEngine> logger,
    ITrafficCoordinator? trafficCoordinator = null,
    TrafficGraphCompileService? trafficCompile = null,
    CompiledTrafficGraphCache? trafficGraphCache = null,
    IOptions<TrafficOptions>? trafficOptions = null,
    TrafficShadowObserver? trafficShadow = null,
    ShadowSingleMoverGuard? shadowMoverGuard = null,
    ISegmentedTrafficCoordinator? segmentedTraffic = null,
    ITrafficOpsLog? trafficOpsLog = null)
{
    public const string AssignedRobotKey = "assignedRobotId";

    private static readonly JobStatus[] ActiveJobStatuses =
        [JobStatus.ASSIGNED, JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.REASSIGNING, JobStatus.RECOVERY_REQUIRED];

    private const string RobotCommandIdKey = "robotCommandId";
    private const string SupersededCommandIdsKey = "supersededRobotCommandIds";
    private const string PendingTrafficKey = "pendingTraffic";

    /// <summary>Resume needs a pose this fresh: a robot that came back online may be somewhere else.</summary>
    private static readonly TimeSpan ResumeTelemetryMaxAge = TimeSpan.FromSeconds(15);

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

    // ------------------------------------------------------------------ resume

    /// <summary>
    /// Continues a PAUSED / REASSIGNING Job from the step that stopped it, on the same robot (default) or another one.
    /// Completed steps are kept. The robot must be localized with fresh telemetry: it may have come back somewhere
    /// else (rebooted, pushed by hand), so a stop it already reached is driven to again before Staff confirm there.
    /// </summary>
    public async Task<Job> ResumeAsync(Guid jobId, Guid? robotId, CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        if (job.Status is not (JobStatus.PAUSED or JobStatus.REASSIGNING))
        {
            throw new ConflictException(
                $"Job {job.JobNo} cannot be resumed from status {job.Status} (only PAUSED or REASSIGNING).",
                "job_not_resumable");
        }

        var previousRobot = AssignedRobot(job);
        var targetRobotId = robotId ?? previousRobot
            ?? throw new DomainValidationException($"Job {job.JobNo} has no robot; pass robotId.", "robot_required");
        var robot = await fleet.GetRobotAsync(targetRobotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{targetRobotId}' was not found.", "robot_not_found");
        EnsureRobotCanTakeJob(robot, job, await RobotsBusyWithOtherJobsAsync(job.Id, cancellationToken));
        EnsureRobotLocalized(robot, DateTimeOffset.UtcNow);

        if (previousRobot is { } previous && previous != robot.Id
            && job.JobContainers.Any(c => c.Status == JobContainerStatus.ONBOARD))
        {
            throw new ConflictException(
                $"Job {job.JobNo} has containers on its previous robot; transfer them first (payload recovery).",
                "payload_recovery_required");
        }

        var workflowSteps = await db.WorkflowSteps.AsNoTracking()
            .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(s => s.Id, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        foreach (var (task, step) in OrderedSteps(job).Where(x => x.Step.Status is JobStepStatus.FAILED or JobStepStatus.CANCELLED))
        {
            ReopenStep(job, task, step, workflowSteps[step.WorkflowStepId].StepKey, now);
        }

        await ReturnToStopIfMovedAsync(job, robot, workflowSteps, now, cancellationToken);

        foreach (var task in job.JobTasks.Where(t => t.Status == JobTaskStatus.FAILED))
        {
            task.Status = task.JobSteps.Any(s => s.Status == JobStepStatus.COMPLETED) ? JobTaskStatus.RUNNING : JobTaskStatus.PENDING;
            task.CompletedAt = null;
            task.FailureCode = null;
        }

        job.ContextValues = new Dictionary<string, JsonElement>(job.ContextValues)
        {
            [AssignedRobotKey] = JsonSerializer.SerializeToElement(robot.Id)
        };
        job.Status = JobStatus.RUNNING;
        job.FailureCode = null;
        job.FailureMessage = null;
        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), robot.Id, null));
        await SaveAndPublishAsync(cancellationToken);
        logger.LogInformation("Job {JobNo} resumed on robot {RobotCode}", job.JobNo, robot.Code);

        await AdvanceAsync(job.Id, cancellationToken);
        return job;
    }

    /// <summary>
    /// The current stop's MOVE already finished but the robot is no longer there (it came back online elsewhere):
    /// drive to the stop again, and ask Staff again once it is there.
    /// </summary>
    private async Task ReturnToStopIfMovedAsync(
        Job job,
        RobotSnapshot robot,
        IReadOnlyDictionary<Guid, WorkflowStep> workflowSteps,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        // A stop is one ONCE_PER_STOP task (CHECK + MOVE) followed by PER_CONTAINER_AT_STOP tasks (confirmations),
        // all carrying the same stopSequenceNo / stopEndpointId.
        var current = job.JobTasks.OrderBy(t => t.SequenceNo)
            .FirstOrDefault(t => t.JobSteps.Any(s => s.Status != JobStepStatus.COMPLETED));
        if (current is null
            || !current.ContextValues.TryGetValue("stopSequenceNo", out var stopNo)
            || !current.ContextValues.TryGetValue("stopEndpointId", out var stop) || stop.ValueKind != JsonValueKind.String)
        {
            return;
        }

        var stopTasks = job.JobTasks.OrderBy(t => t.SequenceNo)
            .Where(t => t.ContextValues.TryGetValue("stopSequenceNo", out var n) && n.GetRawText() == stopNo.GetRawText())
            .ToList();
        var move = stopTasks.SelectMany(t => t.JobSteps.Select(s => (Task: t, Step: s)))
            .LastOrDefault(x => x.Step.StepType == StepType.MOVE && x.Step.Status == JobStepStatus.COMPLETED);
        if (move.Step is null)
        {
            return; // the stop has not been reached yet: the pending MOVE drives there anyway
        }

        var pose = await navigation.GetEndpointPoseAsync(stop.GetGuid(), cancellationToken);
        var distance = pose is null ? 0 : Math.Sqrt(Math.Pow(robot.PoseX - pose.X, 2) + Math.Pow(robot.PoseY - pose.Y, 2));
        if (pose is null || distance <= pose.PositionTolerance)
        {
            return;
        }

        logger.LogInformation(
            "Job {JobNo}: robot {RobotCode} is {Distance:F2} m from stop {Stop}; driving back before continuing",
            job.JobNo, robot.Code, distance, pose.Code);
        // The MOVE + what is still open at this stop (confirmations already given there stay done).
        ReopenStep(job, move.Task, move.Step, workflowSteps[move.Step.WorkflowStepId].StepKey, now);
        foreach (var task in stopTasks)
        {
            foreach (var step in task.JobSteps.Where(s => s.Status is JobStepStatus.WAITING or JobStepStatus.EXECUTING))
            {
                ReopenStep(job, task, step, workflowSteps[step.WorkflowStepId].StepKey, now);
            }
        }

        foreach (var task in stopTasks.Where(t => t.JobSteps.Any(s => s.Status != JobStepStatus.COMPLETED)))
        {
            task.Status = JobTaskStatus.RUNNING;
            task.CompletedAt = null;
        }
    }

    /// <summary>Back to PENDING. A command id the step issued is kept as superseded: its late lifecycle events are ignored.</summary>
    private void ReopenStep(Job job, JobTask task, JobStep step, string stepKey, DateTimeOffset now)
    {
        var superseded = SupersededCommandIds(step.OutputValues);
        if (step.OutputValues.TryGetValue(RobotCommandIdKey, out var commandId) && commandId.ValueKind == JsonValueKind.String)
        {
            superseded.Add(commandId.GetGuid());
        }

        step.OutputValues = superseded.Count == 0
            ? new Dictionary<string, JsonElement>()
            : new Dictionary<string, JsonElement> { [SupersededCommandIdsKey] = JsonSerializer.SerializeToElement(superseded) };
        step.ErrorCode = null;
        step.ErrorMessage = null;
        step.StartedAt = null;
        step.CompletedAt = null;
        SetStepStatus(job, task, step, stepKey, JobStepStatus.PENDING, now);
    }

    /// <summary>A lifecycle event belongs to the step only when it is for the step's current robot command.</summary>
    public static bool IsCurrentCommand(JobStep step, Guid commandId)
    {
        if (SupersededCommandIds(step.OutputValues).Contains(commandId))
        {
            return false;
        }

        return !step.OutputValues.TryGetValue(RobotCommandIdKey, out var current)
               || current.ValueKind != JsonValueKind.String
               || current.GetGuid() == commandId;
    }

    private static List<Guid> SupersededCommandIds(IReadOnlyDictionary<string, JsonElement> outputs) =>
        outputs.TryGetValue(SupersededCommandIdsKey, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Where(e => e.ValueKind == JsonValueKind.String).Select(e => e.GetGuid()).ToList()
            : [];

    private static void EnsureRobotLocalized(RobotSnapshot robot, DateTimeOffset now)
    {
        if (robot.LocalizationStatus != LocalizationStatus.LOCALIZED)
        {
            throw new ConflictException(
                $"Robot {robot.Code} is not localized ({robot.LocalizationStatus?.ToString() ?? "unknown"}). Set its pose on the map first.",
                "robot_not_localized");
        }

        if (robot.LastTelemetryAt is not { } at || now - at > ResumeTelemetryMaxAge)
        {
            throw new ConflictException(
                $"Robot {robot.Code} has no telemetry in the last {ResumeTelemetryMaxAge.TotalSeconds:F0} s; its position is unknown.",
                "robot_telemetry_stale");
        }
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
                // Arm only after commit so a button press cannot race a not-yet-persisted WAITING step.
                await TryArmHumanInteractionAsync(job, step, workflowSteps[step.WorkflowStepId], cancellationToken);
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
    /// Confirms a waiting HUMAN_INTERACTION step (Staff App or robot button).
    /// For PICKUP/DROPOFF the container must match ResolvedInputs (V1: identity, not quantities).
    /// </summary>
    public async Task<JobStep> ConfirmHumanStepAsync(
        Guid jobStepId,
        Guid? containerId,
        HumanConfirmationSource source,
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

        if (source.Channel == ConfirmationSource.STAFF_APP && source.UserId is null)
        {
            throw new AppException("Staff confirmation requires an account id.", 401, "unauthenticated");
        }

        if (source.Channel == ConfirmationSource.ROBOT_BUTTON && (source.RobotId is null || source.MessageId is null))
        {
            throw new DomainValidationException(
                "Robot button confirmation requires robotId and messageId.",
                "interaction_source_incomplete");
        }

        var now = DateTimeOffset.UtcNow;
        var note = source.Note;
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
                ConfirmedBy = source.UserId,
                ConfirmationSource = source.Channel,
                ConfirmedByRobotId = source.RobotId,
                SourceMessageId = source.MessageId,
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
            ["confirmedBy"] = source.UserId is { } uid
                ? JsonSerializer.SerializeToElement(uid)
                : JsonSerializer.SerializeToElement((object?)null),
            ["confirmationSource"] = JsonSerializer.SerializeToElement(source.Channel.ToString()),
            ["confirmedByRobotId"] = source.RobotId is { } rid
                ? JsonSerializer.SerializeToElement(rid)
                : JsonSerializer.SerializeToElement((object?)null),
            ["confirmedAt"] = JsonSerializer.SerializeToElement(now),
            ["note"] = JsonSerializer.SerializeToElement(note ?? string.Empty)
        };
        SetStepStatus(job, task, step, workflowStep.StepKey, JobStepStatus.COMPLETED, now);
        CompleteTaskIfDone(task);
        await SaveAndPublishAsync(cancellationToken);

        await AdvanceAsync(job.Id, cancellationToken);
        return step;
    }

    /// <summary>
    /// Publishes interaction_request for a WAITING PICKUP/DROPOFF step on the assigned robot.
    /// </summary>
    public async Task TryArmHumanInteractionAsync(
        Job job,
        JobStep step,
        WorkflowStep workflowStep,
        CancellationToken cancellationToken = default)
    {
        if (step.Status != JobStepStatus.WAITING || step.StepType != StepType.HUMAN_INTERACTION)
        {
            return;
        }

        var operation = workflowStep.Config.OperationCode;
        if (operation is not (nameof(HumanActionCode.PICKUP_CONFIRM) or nameof(HumanActionCode.DROPOFF_CONFIRM)))
        {
            return;
        }

        var robotId = AssignedRobot(job);
        if (robotId is null)
        {
            logger.LogWarning("Job {JobNo} WAITING handover but has no assignedRobotId; cannot arm button", job.JobNo);
            return;
        }

        if (!step.ResolvedInputs.TryGetValue("containerId", out var containerEl)
            || !step.ResolvedInputs.TryGetValue("endpointId", out var endpointEl))
        {
            logger.LogWarning(
                "Job {JobNo} step {StepKey} missing containerId/endpointId; cannot arm button",
                job.JobNo,
                workflowStep.StepKey);
            return;
        }

        try
        {
            await fleet.RequestHumanInteractionAsync(
                robotId.Value,
                job.Id,
                step.Id,
                operation,
                containerEl.GetGuid(),
                endpointEl.GetGuid(),
                cancellationToken);
        }
        catch (Exception ex)
        {
            // Arming failure must not fail the Job; Staff App can still confirm, and reconnect re-arms.
            logger.LogError(ex, "Failed to arm HUMAN_INTERACTION on robot for Job {JobNo} step {StepKey}", job.JobNo, workflowStep.StepKey);
        }
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
                await HoldStationForHumanAsync(job, task, step, workflowStep, now, cancellationToken);
                SetStepStatus(job, task, step, workflowStep.StepKey, JobStepStatus.WAITING, now);
                // Arm timeout clock — keep hold on miss (no release).
                var timeoutOutputs = new Dictionary<string, JsonElement>(step.OutputValues)
                {
                    ["humanWaitingSince"] = JsonSerializer.SerializeToElement(now),
                    ["humanConfirmTimeoutSec"] = JsonSerializer.SerializeToElement(
                        trafficOptions?.Value.HumanConfirmTimeoutSec ?? 300)
                };
                step.OutputValues = timeoutOutputs;
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
            RouteGrantSnapshot? routeGrant = null;
            var mode = trafficOptions?.Value.Mode ?? TrafficCoordinatorMode.Shadow;

            // Active Mode: segmented coordinator is sole motion authority (publisher issues MQTT).
            if (mode == TrafficCoordinatorMode.Active && segmentedTraffic is not null)
            {
                var graph = await TryResolveTrafficGraphAsync(job.MapVersionId, cancellationToken);
                if (graph is null)
                {
                    Fail(job, task, step, stepKey, "traffic_graph_unavailable",
                        "Active Mode requires a compiled traffic graph.", DateTimeOffset.UtcNow);
                    return true;
                }

                var robot = await fleet.GetRobotAsync(robotId, cancellationToken);
                if (robot is null)
                {
                    Fail(job, task, step, stepKey, "robot_not_found", "Robot missing for Active MOVE.", DateTimeOffset.UtcNow);
                    return true;
                }

                await segmentedTraffic.BindGraphAsync(job.MapVersionId, graph, cancellationToken);

                var purpose = step.ResolvedInputs.TryGetValue("purpose", out var purposeEl)
                    ? purposeEl.GetString()
                    : "TRANSIT";
                var policy = StationPolicyResolver.Resolve(graph, pose.Code, purpose);
                if (policy.Intent is { HoldResourceIds.Length: > 0 } intent)
                {
                    foreach (var rid in intent.HoldResourceIds)
                    {
                        var hold = await segmentedTraffic.HoldServiceResourceAsync(robotId, rid, cancellationToken);
                        if (!hold.Ok)
                        {
                            trafficOpsLog?.Write(new TrafficOpsEvent(
                                Guid.NewGuid(), TrafficOpsEventType.Wait, DateTimeOffset.UtcNow,
                                robotId, job.Id, step.Id, job.MapVersionId, null, rid, null, null,
                                segmentedTraffic.Epoch, null, hold.Reason ?? "STATION_BUSY"));
                            step.OutputValues = new Dictionary<string, JsonElement>
                            {
                                ["startedAt"] = JsonSerializer.SerializeToElement(now),
                                [PendingTrafficKey] = JsonSerializer.SerializeToElement(true),
                                ["trafficMode"] = JsonSerializer.SerializeToElement("Active"),
                                ["trafficWaitingReason"] = JsonSerializer.SerializeToElement("StationBay"),
                                ["stationPolicy"] = JsonSerializer.SerializeToElement(intent.PolicyKind.ToString()),
                                ["stationResourceId"] = JsonSerializer.SerializeToElement(rid)
                            };
                            logger.LogInformation(
                                "Job {JobNo} {StepKey} waiting for station resource {ResourceId}",
                                job.JobNo, stepKey, rid);
                            return false;
                        }

                        trafficOpsLog?.Write(new TrafficOpsEvent(
                            Guid.NewGuid(), TrafficOpsEventType.Service, DateTimeOffset.UtcNow,
                            robotId, job.Id, step.Id, job.MapVersionId, null, rid, null, null,
                            segmentedTraffic.Epoch, null, intent.PolicyKind.ToString()));
                    }
                }

                trafficOpsLog?.Write(new TrafficOpsEvent(
                    Guid.NewGuid(), TrafficOpsEventType.Request, DateTimeOffset.UtcNow,
                    robotId, job.Id, step.Id, job.MapVersionId, null, policy.Intent?.BayResourceId,
                    null, null, segmentedTraffic.Epoch, null, purpose));

                var plan = await segmentedTraffic.RequestSegmentAsync(new RoutePlanRequest(
                    Guid.NewGuid(),
                    robotId,
                    job.MapVersionId,
                    graph,
                    robot.PoseX,
                    robot.PoseY,
                    pose.Code,
                    null,
                    Priority: 0,
                    JobStepId: step.Id,
                    JobId: job.Id), cancellationToken);

                if (!plan.Ok || plan.Segments.Length == 0)
                {
                    Fail(job, task, step, stepKey, "traffic_path_unavailable",
                        plan.Reason ?? "No traffic path for Active MOVE.", DateTimeOffset.UtcNow);
                    return true;
                }

                var acquire = await segmentedTraffic.AcquireAtomicAsync(
                    plan.Segments[0], segmentedTraffic.Epoch, null, cancellationToken);
                if (acquire.Queued)
                {
                    trafficOpsLog?.Write(new TrafficOpsEvent(
                        Guid.NewGuid(), TrafficOpsEventType.Wait, DateTimeOffset.UtcNow,
                        robotId, job.Id, step.Id, job.MapVersionId, null, null,
                        plan.Segments[0].EdgeIds.ToArray(), null, segmentedTraffic.Epoch, null,
                        acquire.WaitingReason.ToString()));
                    step.OutputValues = new Dictionary<string, JsonElement>
                    {
                        ["startedAt"] = JsonSerializer.SerializeToElement(now),
                        [PendingTrafficKey] = JsonSerializer.SerializeToElement(true),
                        ["trafficMode"] = JsonSerializer.SerializeToElement("Active"),
                        ["trafficWaitingReason"] = JsonSerializer.SerializeToElement(acquire.WaitingReason.ToString()),
                        ["stationPolicy"] = JsonSerializer.SerializeToElement(policy.Intent?.PolicyKind.ToString() ?? "Transit")
                    };
                    logger.LogInformation(
                        "Job {JobNo} {StepKey} Active Mode waiting for segment grant (robot {RobotId})",
                        job.JobNo, stepKey, robotId);
                    return false;
                }

                if (!acquire.Granted || acquire.Authority is null)
                {
                    Fail(job, task, step, stepKey, "traffic_grant_rejected",
                        acquire.Reason ?? "Segment grant rejected.", DateTimeOffset.UtcNow);
                    return true;
                }

                trafficOpsLog?.Write(new TrafficOpsEvent(
                    Guid.NewGuid(), TrafficOpsEventType.Grant, DateTimeOffset.UtcNow,
                    robotId, job.Id, step.Id, job.MapVersionId, acquire.Authority.AuthorityId,
                    policy.Intent?.BayResourceId, acquire.Authority.EdgeIds.ToArray(), null,
                    acquire.Authority.Epoch, acquire.Authority.Seq, null));

                // AuthorityPublisher emits NAVIGATE+authority; do not call fleet.NavigateAsync here.
                step.OutputValues = new Dictionary<string, JsonElement>
                {
                    ["startedAt"] = JsonSerializer.SerializeToElement(now),
                    ["trafficMode"] = JsonSerializer.SerializeToElement("Active"),
                    ["trafficAuthorityId"] = JsonSerializer.SerializeToElement(acquire.Authority.AuthorityId),
                    ["trafficGraphHash"] = JsonSerializer.SerializeToElement(acquire.Authority.GraphHash),
                    ["trafficEdgeIds"] = JsonSerializer.SerializeToElement(acquire.Authority.EdgeIds),
                    ["stationPolicy"] = JsonSerializer.SerializeToElement(policy.Intent?.PolicyKind.ToString() ?? "Transit"),
                    ["stationResourceIds"] = JsonSerializer.SerializeToElement(
                        policy.Intent?.HoldResourceIds.ToArray() ?? [])
                };
                logger.LogInformation(
                    "Job {JobNo} {StepKey} Active Mode segment granted auth={AuthorityId} edges={Count}",
                    job.JobNo, stepKey, acquire.Authority.AuthorityId, acquire.Authority.EdgeIds.Length);
                return false;
            }

            if (mode == TrafficCoordinatorMode.Shadow && shadowMoverGuard is not null)
            {
                if (!shadowMoverGuard.TryEnter(job.MapVersionId, robotId, out var blocker))
                {
                    Fail(job, task, step, stepKey, "shadow_single_mover",
                        $"Shadow Mode allows only one moving robot per map; blocked by {blocker}.", DateTimeOffset.UtcNow);
                    return true;
                }
            }

            if (trafficCoordinator is not null)
            {
                var graph = await TryResolveTrafficGraphAsync(job.MapVersionId, cancellationToken);
                if (graph is not null)
                {
                    var robot = await fleet.GetRobotAsync(robotId, cancellationToken);
                    var startNode = robot is null
                        ? null
                        : TrafficGraphQueries.FindNearestNodeId(graph, robot.PoseX, robot.PoseY);
                    var goalNode = TrafficGraphQueries.ResolveEndpointNodeId(graph, pose.Code, pose.X, pose.Y);
                    if (startNode is null || goalNode is null)
                    {
                        shadowMoverGuard?.Exit(job.MapVersionId, robotId);
                        Fail(job, task, step, stepKey, "traffic_nodes_unresolved",
                            "Could not resolve start/goal traffic nodes for MOVE.", DateTimeOffset.UtcNow);
                        return true;
                    }

                    var grant = trafficCoordinator.TryAcquireRouteGrant(
                        robotId,
                        job.MapVersionId,
                        graph,
                        startNode.Value,
                        goalNode.Value,
                        step.Id,
                        new PendingNavigateContext(job.Id, pose.X, pose.Y, pose.Yaw));

                    if (trafficShadow is not null && robot is not null)
                    {
                        try
                        {
                            await trafficShadow.OnMoveRequestedAsync(
                                robotId,
                                job.MapVersionId,
                                graph,
                                robot.PoseX,
                                robot.PoseY,
                                startNode.Value,
                                goalNode.Value,
                                step.Id,
                                job.Id,
                                grant,
                                cancellationToken);
                        }
                        catch (Exception shadowEx)
                        {
                            logger.LogDebug(shadowEx, "Traffic shadow observe failed for job {JobNo}", job.JobNo);
                        }
                    }

                    if (grant.WaitQueued)
                    {
                        var pendingOutputs = new Dictionary<string, JsonElement>
                        {
                            ["startedAt"] = JsonSerializer.SerializeToElement(now),
                            [PendingTrafficKey] = JsonSerializer.SerializeToElement(true),
                            ["trafficGraphHash"] = JsonSerializer.SerializeToElement(grant.GraphHash ?? graph.GraphHash),
                            ["trafficEdgeIds"] = JsonSerializer.SerializeToElement(grant.EdgeIds)
                        };
                        if (step.OutputValues.TryGetValue(SupersededCommandIdsKey, out var supersededPending))
                        {
                            pendingOutputs[SupersededCommandIdsKey] = supersededPending;
                        }

                        step.OutputValues = pendingOutputs;
                        logger.LogInformation(
                            "Job {JobNo} {StepKey} waiting for traffic grant (robot {RobotId})",
                            job.JobNo,
                            stepKey,
                            robotId);
                        return false;
                    }

                    if (!grant.Granted || grant.GraphHash is null)
                    {
                        shadowMoverGuard?.Exit(job.MapVersionId, robotId);
                        Fail(job, task, step, stepKey, "traffic_path_unavailable",
                            "No traffic path between robot pose and target endpoint.", DateTimeOffset.UtcNow);
                        return true;
                    }

                    routeGrant = new RouteGrantSnapshot(grant.GraphHash, grant.EdgeIds);
                }
            }

            var commandId = await fleet.NavigateAsync(
                robotId, pose.X, pose.Y, pose.Yaw, job.Id, step.Id, cancellationToken, routeGrant);
            var outputs = new Dictionary<string, JsonElement>
            {
                ["startedAt"] = JsonSerializer.SerializeToElement(now),
                [RobotCommandIdKey] = JsonSerializer.SerializeToElement(commandId)
            };
            if (routeGrant is not null)
            {
                outputs["trafficGraphHash"] = JsonSerializer.SerializeToElement(routeGrant.GraphHash);
                outputs["trafficEdgeIds"] = JsonSerializer.SerializeToElement(routeGrant.EdgeIds);
            }

            if (step.OutputValues.TryGetValue(SupersededCommandIdsKey, out var superseded))
            {
                outputs[SupersededCommandIdsKey] = superseded; // commands of earlier attempts (resume)
            }

            step.OutputValues = outputs;
            logger.LogInformation("Job {JobNo} {StepKey} → robot command {CommandId} to {Endpoint}", job.JobNo, stepKey, commandId, pose.Code);
            return false;
        }
        catch (AppException ex)
        {
            trafficCoordinator?.ReleaseByJobStep(step.Id);
            shadowMoverGuard?.Exit(job.MapVersionId, robotId);
            Fail(job, task, step, stepKey, ex.Code ?? "navigate_rejected", ex.Message, DateTimeOffset.UtcNow);
            return true;
        }
    }

    private async Task<CompiledTrafficGraph?> TryResolveTrafficGraphAsync(
        Guid mapVersionId,
        CancellationToken cancellationToken)
    {
        if (trafficGraphCache is not null &&
            trafficGraphCache.TryGetForMap(mapVersionId, out var cached) &&
            cached is not null)
        {
            return cached;
        }

        if (trafficCompile is null)
        {
            return null;
        }

        try
        {
            var bundle = await trafficCompile.CompileAsync(mapVersionId, includeOccupancy: false, cancellationToken);
            return bundle.Result.HasErrors ? null : bundle.Result.Graph;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Traffic graph unavailable for map {MapVersionId}; MOVE without route grant", mapVersionId);
            return null;
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

        // OnFailure policy. No automatic reassignment: the Job stops in that state until an operator resumes it
        // (POST /jobs/{id}/resume → ResumeAsync) or it is cancelled.
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
        var allDone = task.JobSteps.All(s => s.Status == JobStepStatus.COMPLETED);
        if (task.Status != JobTaskStatus.COMPLETED && allDone)
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

    /// <summary>
    /// Operator cancel: job → CANCELLED; traffic CancelRequest (quarantine if occupied — no silent release).
    /// </summary>
    public async Task<Job> CancelJobAsync(Guid jobId, string? reason, CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        if (job.Status is JobStatus.COMPLETED or JobStatus.CANCELLED or JobStatus.FAILED)
        {
            throw new ConflictException($"Job {job.JobNo} is already terminal ({job.Status}).", "job_already_terminal");
        }

        var now = DateTimeOffset.UtcNow;
        var robotId = AssignedRobot(job);
        if (robotId is Guid rid && segmentedTraffic is not null
            && (trafficOptions?.Value.Mode ?? TrafficCoordinatorMode.Shadow) == TrafficCoordinatorMode.Active)
        {
            await segmentedTraffic.CancelRequestAsync(rid, null, cancellationToken);
            trafficOpsLog?.Write(new TrafficOpsEvent(
                Guid.NewGuid(), TrafficOpsEventType.Cancel, now,
                rid, job.Id, null, job.MapVersionId, null, null, null, null,
                segmentedTraffic.Epoch, null, reason ?? "OPERATOR_CANCEL"));
        }

        var workflowSteps = await db.WorkflowSteps.AsNoTracking()
            .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(s => s.Id, cancellationToken);

        foreach (var (task, step) in OrderedSteps(job)
                     .Where(x => x.Step.Status is JobStepStatus.PENDING or JobStepStatus.EXECUTING or JobStepStatus.WAITING))
        {
            step.ErrorCode = "job_cancelled";
            step.ErrorMessage = reason ?? "Cancelled by operator.";
            var stepKey = workflowSteps.TryGetValue(step.WorkflowStepId, out var ws) ? ws.StepKey : step.Id.ToString("N");
            SetStepStatus(job, task, step, stepKey, JobStepStatus.CANCELLED, now);
        }

        foreach (var task in job.JobTasks.Where(t => t.Status is JobTaskStatus.PENDING or JobTaskStatus.RUNNING))
        {
            task.Status = JobTaskStatus.CANCELLED;
            task.CompletedAt ??= now;
            task.FailureCode = "job_cancelled";
        }

        job.Status = JobStatus.CANCELLED;
        job.CompletedAt = now;
        job.FailureCode = "job_cancelled";
        job.FailureMessage = reason ?? "Cancelled by operator.";
        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), robotId, job.FailureCode));
        await SaveAndPublishAsync(cancellationToken);
        return job;
    }

    /// <summary>
    /// Escalate HUMAN_INTERACTION waits past timeout. Keeps station hold; does not release occupancy.
    /// </summary>
    public async Task<int> EscalateHumanConfirmTimeoutsAsync(CancellationToken cancellationToken = default)
    {
        var defaultTimeout = trafficOptions?.Value.HumanConfirmTimeoutSec ?? 300;
        var now = DateTimeOffset.UtcNow;
        var waiting = await db.Jobs
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .Where(j => j.Status == JobStatus.RUNNING)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        var escalated = 0;
        foreach (var job in waiting)
        {
            foreach (var (task, step) in OrderedSteps(job)
                         .Where(x => x.Step.Status == JobStepStatus.WAITING && x.Step.StepType == StepType.HUMAN_INTERACTION))
            {
                if (step.OutputValues.TryGetValue("humanTimeoutEscalated", out var done) && done.ValueKind == JsonValueKind.True)
                {
                    continue;
                }

                DateTimeOffset since = step.StartedAt ?? now;
                if (step.OutputValues.TryGetValue("humanWaitingSince", out var sinceEl)
                    && sinceEl.ValueKind == JsonValueKind.String
                    && DateTimeOffset.TryParse(sinceEl.GetString(), out var sinceDto))
                {
                    since = sinceDto;
                }
                var timeoutSec = step.OutputValues.TryGetValue("humanConfirmTimeoutSec", out var tEl)
                    && tEl.TryGetInt32(out var t)
                    ? t
                    : defaultTimeout;
                if ((now - since).TotalSeconds < timeoutSec)
                {
                    continue;
                }

                var outputs = new Dictionary<string, JsonElement>(step.OutputValues)
                {
                    ["humanTimeoutEscalated"] = JsonSerializer.SerializeToElement(true),
                    ["humanTimeoutAt"] = JsonSerializer.SerializeToElement(now)
                };
                step.OutputValues = outputs;
                trafficOpsLog?.Write(new TrafficOpsEvent(
                    Guid.NewGuid(), TrafficOpsEventType.Timeout, now,
                    AssignedRobot(job), job.Id, step.Id, job.MapVersionId, null,
                    step.OutputValues.TryGetValue("stationResourceId", out var ridEl) ? ridEl.GetString() : null,
                    null, null, segmentedTraffic?.Epoch, null, "HUMAN_CONFIRM_TIMEOUT"));
                logger.LogWarning(
                    "Job {JobNo} step {StepId} HUMAN confirm timeout — hold kept, operator escalation",
                    job.JobNo, step.Id);
                escalated++;
            }
        }

        if (escalated > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }

        return escalated;
    }

    private async Task HoldStationForHumanAsync(
        Job job,
        JobTask task,
        JobStep step,
        WorkflowStep workflowStep,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        _ = task;
        if ((trafficOptions?.Value.Mode ?? TrafficCoordinatorMode.Shadow) != TrafficCoordinatorMode.Active
            || segmentedTraffic is null
            || !step.ResolvedInputs.TryGetValue("robotId", out var humanRobotEl))
        {
            return;
        }

        var humanRobotId = humanRobotEl.GetGuid();
        var graph = await TryResolveTrafficGraphAsync(job.MapVersionId, cancellationToken);
        string? endpointCode = null;
        if (step.TargetEndpointId is Guid epId)
        {
            var pose = await navigation.GetEndpointPoseAsync(epId, cancellationToken);
            endpointCode = pose?.Code;
        }

        endpointCode ??= step.ResolvedInputs.TryGetValue("endpointCode", out var codeEl)
            ? codeEl.GetString()
            : null;

        // Infer purpose from prior MOVE or action code.
        var purpose = "PICKUP";
        if (step.ResolvedInputs.TryGetValue("actionCode", out var actionEl))
        {
            var action = actionEl.GetString() ?? "";
            if (action.Contains("DROPOFF", StringComparison.OrdinalIgnoreCase))
            {
                purpose = "DROPOFF";
            }
            else if (action.Contains("INSPECTION", StringComparison.OrdinalIgnoreCase))
            {
                purpose = "TRANSIT";
            }
            else if (action.Contains("CHARGE", StringComparison.OrdinalIgnoreCase))
            {
                purpose = "CHARGE";
            }
        }

        if (graph is not null && !string.IsNullOrWhiteSpace(endpointCode))
        {
            var policy = StationPolicyResolver.Resolve(graph, endpointCode, purpose);
            if (policy.Intent is { HoldResourceIds.Length: > 0 } intent)
            {
                foreach (var rid in intent.HoldResourceIds)
                {
                    await segmentedTraffic.HoldServiceResourceAsync(humanRobotId, rid, cancellationToken);
                    trafficOpsLog?.Write(new TrafficOpsEvent(
                        Guid.NewGuid(), TrafficOpsEventType.Service, now,
                        humanRobotId, job.Id, step.Id, job.MapVersionId, null, rid, null, null,
                        segmentedTraffic.Epoch, null, $"HUMAN:{intent.PolicyKind}"));
                }

                var outs = new Dictionary<string, JsonElement>(step.OutputValues)
                {
                    ["stationPolicy"] = JsonSerializer.SerializeToElement(intent.PolicyKind.ToString()),
                    ["stationResourceIds"] = JsonSerializer.SerializeToElement(intent.HoldResourceIds.ToArray()),
                    ["stationResourceId"] = JsonSerializer.SerializeToElement(intent.BayResourceId ?? intent.HoldResourceIds[0])
                };
                step.OutputValues = outs;
                return;
            }
        }

        // Fallback: keep synthetic hold only when no compiled bay (legacy Active path).
        var fallback = $"service:{job.MapVersionId}:{workflowStep.StepKey}";
        await segmentedTraffic.HoldServiceResourceAsync(humanRobotId, fallback, cancellationToken);
        trafficOpsLog?.Write(new TrafficOpsEvent(
            Guid.NewGuid(), TrafficOpsEventType.Service, now,
            humanRobotId, job.Id, step.Id, job.MapVersionId, null, fallback, null, null,
            segmentedTraffic.Epoch, null, "HUMAN:FALLBACK"));
    }
}
