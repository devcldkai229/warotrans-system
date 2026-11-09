using System.Collections.Immutable;
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
///   WAIT               DURATION: step WAITING with a waitUntil; WaitStepWakeupHostedService completes it once due
///                      (WFX-01). EVENT / ROBOT_STATE are refused at publish and fail at runtime.
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
    IOptions<TrafficOptions>? trafficOptions = null,
    TrafficShadowObserver? trafficShadow = null,
    ShadowSingleMoverGuard? shadowMoverGuard = null,
    ISegmentedTrafficCoordinator? segmentedTraffic = null,
    ITrafficOpsLog? trafficOpsLog = null,
    IIssueReporter? issueReporter = null)
{
    public const string AssignedRobotKey = "assignedRobotId";

    private static readonly JobStatus[] ActiveJobStatuses =
        [JobStatus.ASSIGNED, JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.REASSIGNING, JobStatus.RECOVERY_REQUIRED];

    private const string RobotCommandIdKey = "robotCommandId";
    private const string SupersededCommandIdsKey = "supersededRobotCommandIds";

    /// <summary>
    /// MOVE could not start because traffic quarantined / could not place the robot (unlocalized, quarantine, seed
    /// conflict). Recoverable once an operator reconciles the robot, so the Job pauses instead of failing.
    /// </summary>
    private const string TrafficRobotUnavailable = "traffic_robot_unavailable";
    private const string NavigationBlocked = "NAVIGATION_BLOCKED";
    private const string PendingTrafficKey = "pendingTraffic";

    /// <summary>Resume needs a pose this fresh: a robot that came back online may be somewhere else.</summary>
    private static readonly TimeSpan ResumeTelemetryMaxAge = TimeSpan.FromSeconds(15);

    private readonly List<IIntegrationEvent> _pendingEvents = [];

    // ------------------------------------------------------------------ start

    /// <summary>Assigns a robot (given or best available on the Job's map) and starts executing.</summary>
    /// <summary>
    /// FL-02: choosing a robot and saving the assignment is one critical section, so two Jobs started at the same
    /// moment cannot both take the same free robot (single backend instance; the busy check reads committed Jobs).
    /// </summary>
    private static readonly SemaphoreSlim DispatchGate = new(1, 1);

    public async Task<Job> StartAsync(
        Guid jobId,
        Guid? robotId,
        CancellationToken cancellationToken = default,
        DispatchOverride? dispatchOverride = null)
    {
        Job job;
        bool assigned;
        await DispatchGate.WaitAsync(cancellationToken);
        try
        {
            (job, assigned) = await AssignRobotAsync(jobId, robotId, dispatchOverride, cancellationToken);
        }
        finally
        {
            DispatchGate.Release();
        }

        if (assigned)
        {
            await AdvanceAsync(job.Id, cancellationToken);
        }

        return job;
    }

    private async Task<(Job Job, bool Assigned)> AssignRobotAsync(
        Guid jobId,
        Guid? robotId,
        DispatchOverride? dispatchOverride,
        CancellationToken cancellationToken)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);

        if (job.Status == JobStatus.RUNNING)
        {
            return (job, false); // idempotent
        }

        if (JobActionPolicy.StateReason(JobActionPolicy.Start, job.Status) is { } notStartable)
        {
            throw new ConflictException($"Job {job.JobNo} cannot be started from status {job.Status}.", notStartable);
        }

        var busyRobots = await RobotsBusyWithOtherJobsAsync(job.Id, cancellationToken);
        // FL-01 / FLT-01: every robot is evaluated (eligible or not, and why) and the decision is stored.
        var candidates = await EvaluateDispatchAsync(job, busyRobots, cancellationToken);
        RobotSnapshot robot;
        if (robotId is { } requested)
        {
            robot = await fleet.GetRobotAsync(requested, cancellationToken)
                ?? throw new NotFoundException($"Robot '{requested}' was not found.", "robot_not_found");
            EnsureRobotCanTakeJob(robot, job, busyRobots);
            EnsureBatteryAllowsDispatch(candidates.FirstOrDefault(c => c.RobotId == requested), robot, dispatchOverride);
        }
        else
        {
            var best = candidates.FirstOrDefault(c => c.Eligible);
            if (best is null)
            {
                await fleet.RecordDispatchDecisionAsync(
                    new DispatchDecisionRecord(job.Id, null, DispatchTriggers.Start, dispatchOverride?.ActorId, null, candidates), cancellationToken);
                throw new ConflictException(
                    "No robot on the Job's map version is eligible to take this Job" + DescribeRejections(candidates) + ".",
                    "no_robot_available");
            }

            robot = await fleet.GetRobotAsync(best.RobotId, cancellationToken)
                ?? throw new NotFoundException($"Robot '{best.RobotId}' was not found.", "robot_not_found");
        }

        await EnsureRobotAtHomeForFirstJobAsync(robot, job, cancellationToken);

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
        await fleet.RecordDispatchDecisionAsync(
            new DispatchDecisionRecord(job.Id, robot.Id, DispatchTriggers.Start, dispatchOverride?.ActorId, dispatchOverride?.Reason, candidates),
            cancellationToken);
        logger.LogInformation("Job {JobNo} started on robot {RobotCode}", job.JobNo, robot.Code);
        return (job, true);
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
        if (JobActionPolicy.StateReason(JobActionPolicy.Resume, job.Status) is { } notResumable)
        {
            throw new ConflictException(
                $"Job {job.JobNo} cannot be resumed from status {job.Status} (only PAUSED or REASSIGNING).",
                notResumable);
        }

        var previousRobot = AssignedRobot(job);
        var targetRobotId = robotId ?? previousRobot
            ?? throw new DomainValidationException($"Job {job.JobNo} has no robot; pass robotId.", "robot_required");
        var robot = await fleet.GetRobotAsync(targetRobotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{targetRobotId}' was not found.", "robot_not_found");

        // WFX-03: the operator's pause held the robot; resuming the job releases that hold first.
        // A request cancelled with cargo on board held the robot the same way; resuming delivers that cargo.
        if (robot.MotionHeld && job.FailureCode is OperatorPausedCode or CargoOnboardCancelCode && robot.Id == previousRobot)
        {
            await fleet.ResumeRobotAsync(robot.Id, cancellationToken);
            robot = await fleet.GetRobotAsync(targetRobotId, cancellationToken) ?? robot;
        }

        var busyForResume = await RobotsBusyWithOtherJobsAsync(job.Id, cancellationToken);
        EnsureRobotCanTakeJob(robot, job, busyForResume);
        EnsureRobotLocalized(robot, DateTimeOffset.UtcNow);
        // A robot whose battery is known to be low takes no more work; an unknown battery does not block a resume
        // (the robot was already on this job), it is recorded in the decision.
        var resumeCandidates = await EvaluateDispatchAsync(job, busyForResume, cancellationToken);
        if (resumeCandidates.FirstOrDefault(c => c.RobotId == robot.Id) is { } resumeCandidate
            && resumeCandidate.Reasons.Contains(DispatchReasons.BatteryLow))
        {
            throw new ConflictException($"Robot {robot.Code} battery is below the dispatch minimum.", DispatchReasons.BatteryLow);
        }

        await fleet.RecordDispatchDecisionAsync(
            new DispatchDecisionRecord(job.Id, robot.Id, DispatchTriggers.Resume, null, null, resumeCandidates), cancellationToken);

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
            .FirstOrDefault(t => t.JobSteps.Any(s => s.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED)));
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

        foreach (var task in stopTasks.Where(t => t.JobSteps.Any(s => s.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED))))
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
                case JobStepStatus.COMPLETED or JobStepStatus.SKIPPED:
                    // A MOVE is completed by its robot RESULT outside this loop, so its task is closed here.
                    CompleteTaskIfDone(task);
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

        // WFX-05: REPORT_ISSUE has a real side effect. The issue is opened before the step completes; if that fails the
        // step stays WAITING and the caller gets the error. Idempotent on the step, so a retry reuses the same issue.
        Guid? issueId = null;
        if (operation == nameof(HumanActionCode.REPORT_ISSUE))
        {
            if (issueReporter is null)
            {
                throw new AppException("Issue reporting is not available.", 503, "issue_reporting_unavailable");
            }

            var stepContainer = step.ResolvedInputs.TryGetValue("containerId", out var sc) && sc.ValueKind == JsonValueKind.String
                ? sc.GetGuid()
                : (Guid?)null;
            issueId = await issueReporter.ReportFromStepAsync(
                new StepIssueDraft(
                    step.Id,
                    job.Id,
                    job.JobNo,
                    workflowStep.StepKey,
                    source.UserId,
                    AssignedRobot(job),
                    stepContainer,
                    string.IsNullOrWhiteSpace(note)
                        ? $"Reported at step \"{workflowStep.StepKey}\" of job {job.JobNo}."
                        : note.Trim()),
                cancellationToken);
        }

        step.OutputValues = new Dictionary<string, JsonElement>
        {
            ["confirmed"] = JsonSerializer.SerializeToElement(true),
            ["issueId"] = issueId is { } openedIssue
                ? JsonSerializer.SerializeToElement(openedIssue)
                : JsonSerializer.SerializeToElement((object?)null),
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

    /// <summary>FailureCode of a Container a person reported failed at its handover (WH-10).</summary>
    public const string ContainerReportedFailedCode = "container_reported_failed";

    /// <summary>
    /// WH-10: this Container cannot go on (missing, damaged), the others can. At its waiting handover step the Container
    /// is FAILED, what only served it is skipped, and the Job goes on: what was delivered stays delivered. Cargo on the
    /// robot is not treated as returned: it stays IN_TRANSIT for a person to recover and an issue says so. With no
    /// Container delivered and none left to carry, the Job itself has failed.
    /// </summary>
    public async Task FailContainerAtStepAsync(
        Guid jobStepId,
        Guid containerId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var stepRef = await db.JobSteps.AsNoTracking()
            .Where(s => s.Id == jobStepId)
            .Select(s => new { s.JobTask.JobId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException($"JobStep '{jobStepId}' was not found.", "job_step_not_found");

        var job = await LoadJobAsync(stepRef.JobId, cancellationToken);
        var (_, step) = OrderedSteps(job).First(x => x.Step.Id == jobStepId);
        if (job.Status != JobStatus.RUNNING)
        {
            throw new ConflictException($"Job {job.JobNo} is {job.Status}, not RUNNING.", "job_not_running");
        }

        if (step.StepType != StepType.HUMAN_INTERACTION || step.Status != JobStepStatus.WAITING)
        {
            throw new ConflictException("Only a waiting handover step can report its container.", "job_step_not_waiting");
        }

        var expected = step.ResolvedInputs.TryGetValue("containerId", out var c) && c.ValueKind == JsonValueKind.String
            ? c.GetGuid()
            : (Guid?)null;
        if (expected != containerId)
        {
            throw new DomainValidationException(
                $"Container '{containerId}' is not the container of this step.",
                "handover_container_mismatch");
        }

        var now = DateTimeOffset.UtcNow;
        var keys = await db.WorkflowSteps.AsNoTracking()
            .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(s => s.Id, s => s.StepKey, cancellationToken);
        var jobContainer = job.JobContainers.First(jc => jc.ContainerId == containerId);
        var onBoard = jobContainer.Status == JobContainerStatus.ONBOARD;

        jobContainer.FailureCode = ContainerReportedFailedCode;
        jobContainer.FailureMessage = reason.Length > 500 ? reason[..500] : reason;
        jobContainer.FailedAt = now;
        SetContainerStatus(job, jobContainer, JobContainerStatus.FAILED, now);

        var served = job.JobContainers.Where(jc => jc.Status is not (JobContainerStatus.FAILED or JobContainerStatus.CANCELLED))
            .Select(jc => jc.ContainerId)
            .ToHashSet();
        foreach (var task in job.JobTasks.Where(t => ServesOnlyFailedContainers(t, containerId, served)))
        {
            foreach (var open in task.JobSteps.Where(s => s.Status is JobStepStatus.PENDING or JobStepStatus.READY or JobStepStatus.WAITING))
            {
                SetStepStatus(job, task, open, keys.GetValueOrDefault(open.WorkflowStepId, open.Id.ToString("N")), JobStepStatus.SKIPPED, now);
            }

            CompleteTaskIfDone(task);
        }

        var nothingDelivered = job.JobContainers.All(jc => jc.Status != JobContainerStatus.DELIVERED);
        if (served.Count == 0 && nothingDelivered)
        {
            foreach (var (task, open) in OrderedSteps(job).Where(x => x.Step.Status is JobStepStatus.PENDING or JobStepStatus.READY or JobStepStatus.WAITING))
            {
                SetStepStatus(job, task, open, keys.GetValueOrDefault(open.WorkflowStepId, open.Id.ToString("N")), JobStepStatus.CANCELLED, now);
                task.Status = JobTaskStatus.CANCELLED;
                task.CompletedAt ??= now;
            }

            job.Status = JobStatus.FAILED;
            job.CompletedAt = now;
            job.FailureCode = ContainerReportedFailedCode;
            job.FailureMessage = $"Every container failed: {jobContainer.FailureMessage}";
            _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), AssignedRobot(job), job.FailureCode));
        }

        await SaveAndPublishAsync(cancellationToken);
        logger.LogWarning("Job {JobNo}: container {ContainerId} reported failed: {Reason}", job.JobNo, containerId, reason);

        if (onBoard && issueReporter is not null)
        {
            await issueReporter.ReportAsync(
                new SystemIssueDraft(
                    $"container-failed-onboard:{job.Id}:{containerId}",
                    job.Id,
                    job.JobNo,
                    null,
                    AssignedRobot(job),
                    containerId,
                    $"A container reported failed in Job {job.JobNo} is still on the robot. Reason: {jobContainer.FailureMessage}. "
                    + "Unload it and recover it to the shelf it is on.",
                    High: true,
                    TransportRequestId: jobContainer.TransportRequestId),
                cancellationToken);
        }

        await AdvanceAsync(job.Id, cancellationToken);
    }

    /// <summary>
    /// A confirmation task of the failed Container, or a stop that has nothing left to carry and has not started.
    /// Job-wide tasks (a stop list is absent) always stay.
    /// </summary>
    private static bool ServesOnlyFailedContainers(JobTask task, Guid failed, IReadOnlySet<Guid> served)
    {
        if (task.ContextValues.TryGetValue("containerId", out var single) && single.ValueKind == JsonValueKind.String)
        {
            return single.GetGuid() == failed;
        }

        if (!task.ContextValues.TryGetValue("containerIds", out var many) || many.ValueKind != JsonValueKind.Array)
        {
            return false;
        }

        return task.JobSteps.All(s => s.Status is JobStepStatus.PENDING or JobStepStatus.READY)
            && !many.EnumerateArray().Any(id => served.Contains(id.GetGuid()));
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

            case StepType.WAIT when operation == nameof(WaitMode.DURATION):
            {
                var seconds = step.ResolvedInputs.TryGetValue("durationSeconds", out var d) && d.ValueKind == JsonValueKind.Number
                    ? d.GetInt32()
                    : -1;
                if (seconds is < 0 or > MaxWaitSeconds)
                {
                    Fail(job, task, step, workflowStep.StepKey, "wait_duration_invalid",
                        $"durationSeconds must be between 0 and {MaxWaitSeconds}.", now);
                    return true;
                }

                // Durable: the deadline is stored on the step; no thread or resource is held while waiting.
                step.OutputValues = new Dictionary<string, JsonElement>(step.OutputValues)
                {
                    [WaitUntilKey] = JsonSerializer.SerializeToElement(now.AddSeconds(seconds)),
                    ["waitStartedAt"] = JsonSerializer.SerializeToElement(now)
                };
                SetStepStatus(job, task, step, workflowStep.StepKey, JobStepStatus.WAITING, now);
                return false;
            }

            default:
                Fail(job, task, step, workflowStep.StepKey, "step_type_not_supported",
                    $"{step.StepType}.{operation} is not executable in V1.", now);
                return true;
        }
    }

    public const string WaitUntilKey = "waitUntil";

    /// <summary>A WAIT longer than a day is a scheduling problem, not a step.</summary>
    private const int MaxWaitSeconds = 86_400;

    /// <summary>
    /// WFX-01: completes WAIT.DURATION steps whose deadline passed and continues their Jobs. Only RUNNING Jobs are
    /// woken (a paused Job continues after Resume; the deadline is wall-clock, a pause does not extend it). A step is
    /// woken exactly once: it must still be WAITING when re-read, and the save is followed by AdvanceAsync.
    /// </summary>
    public async Task<int> WakeDueWaitStepsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var jobIds = await db.Jobs.AsNoTracking()
            .Where(j => j.Status == JobStatus.RUNNING
                        && j.JobTasks.Any(t => t.JobSteps.Any(s => s.StepType == StepType.WAIT && s.Status == JobStepStatus.WAITING)))
            .Select(j => j.Id)
            .ToListAsync(cancellationToken);

        var woken = 0;
        foreach (var jobId in jobIds)
        {
            var job = await LoadJobAsync(jobId, cancellationToken);
            if (job.Status != JobStatus.RUNNING)
            {
                continue;
            }

            var due = OrderedSteps(job)
                .Where(x => x.Step.StepType == StepType.WAIT && x.Step.Status == JobStepStatus.WAITING
                            && x.Step.OutputValues.TryGetValue(WaitUntilKey, out var until)
                            && until.GetDateTimeOffset() <= now)
                .ToList();
            if (due.Count == 0)
            {
                continue;
            }

            var keys = await db.WorkflowSteps.AsNoTracking()
                .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
                .ToDictionaryAsync(s => s.Id, s => s.StepKey, cancellationToken);
            foreach (var (task, step) in due)
            {
                var started = step.OutputValues.TryGetValue("waitStartedAt", out var s) ? s.GetDateTimeOffset() : step.StartedAt ?? now;
                step.OutputValues = new Dictionary<string, JsonElement>(step.OutputValues)
                {
                    ["resumeReason"] = JsonSerializer.SerializeToElement("DURATION_ELAPSED"),
                    ["resumedAt"] = JsonSerializer.SerializeToElement(now),
                    ["actualWaitSeconds"] = JsonSerializer.SerializeToElement((int)Math.Round((now - started).TotalSeconds))
                };
                SetStepStatus(job, task, step, keys.GetValueOrDefault(step.WorkflowStepId, step.Id.ToString("N")), JobStepStatus.COMPLETED, now);
                woken++;
            }

            await SaveAndPublishAsync(cancellationToken);
            await AdvanceAsync(job.Id, cancellationToken);
        }

        return woken;
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

            // Stage-3 Semantic Mode: Backend authorizes spatial resources; Nav2 proposes the path (no RouteGraph A*).
            if (mode == TrafficCoordinatorMode.Semantic && segmentedTraffic is not null)
            {
                var robot = await fleet.GetRobotAsync(robotId, cancellationToken);
                if (robot is null)
                {
                    Fail(job, task, step, stepKey, "robot_not_found", "Robot missing for Semantic MOVE.", DateTimeOffset.UtcNow);
                    return true;
                }

                var mapDir = trafficOptions?.Value.SemanticMapDirectory?.Trim() ?? "";
                if (string.IsNullOrWhiteSpace(mapDir) || !Directory.Exists(mapDir))
                {
                    Fail(job, task, step, stepKey, "semantic_map_unavailable",
                        "Traffic:Semantic MapDirectory missing for Semantic MOVE.", DateTimeOffset.UtcNow);
                    return true;
                }

                // The bundle is one directory on disk, not per map: a job on another map version must not
                // be reserved against it (its fingerprint, zones and endpoints describe a different floor).
                var bundleMapId = SemanticReservation.TryReadManifestMapVersionId(mapDir);
                if (bundleMapId != job.MapVersionId)
                {
                    Fail(job, task, step, stepKey, "semantic_map_mismatch",
                        $"SemanticMapDirectory is for map version '{bundleMapId?.ToString() ?? "unknown"}', the Job runs on '{job.MapVersionId}'.",
                        DateTimeOffset.UtcNow);
                    return true;
                }

                var policy = SemanticReservation.TryLoadFromDirectory(mapDir, job.MapVersionId, "");
                if (policy is null)
                {
                    Fail(job, task, step, stepKey, "semantic_policy_unavailable",
                        "Could not load semantic_manifest / single_occupancy from SemanticMapDirectory.", DateTimeOffset.UtcNow);
                    return true;
                }

                // Same overrides as SemanticPolicyBootstrapHostedService, so both binds describe the same robot.
                policy = trafficOptions!.Value.ApplySemanticOverrides(policy);

                var bind = await segmentedTraffic.BindSemanticPolicyAsync(policy, cancellationToken);
                if (!bind.Ok)
                {
                    Fail(job, task, step, stepKey, "semantic_policy_in_use",
                        $"Cannot bind semantic policy: {bind.Reason}", DateTimeOffset.UtcNow);
                    return true;
                }

                // A stored pose is evidence only while fresh: stale telemetry means we do not know where it is.
                var poseAge = DateTimeOffset.UtcNow - (robot.LastTelemetryAt ?? DateTimeOffset.MinValue);
                if (poseAge > TimeSpan.FromSeconds(Math.Max(0.5, trafficOptions.Value.PoseMaxAgeSec)))
                {
                    Fail(job, task, step, stepKey, TrafficRobotUnavailable,
                        $"Semantic Mode cannot move the robot: no telemetry for {poseAge.TotalSeconds:F0} s.", DateTimeOffset.UtcNow);
                    return true;
                }

                var locOk = robot.LocalizationStatus == LocalizationStatus.LOCALIZED;
                var tracked = await segmentedTraffic.EnsureTrackedAsync(
                    robotId, robot.PoseX, robot.PoseY, locOk, cancellationToken);
                if (!tracked.Ok)
                {
                    Fail(job, task, step, stepKey, TrafficRobotUnavailable,
                        $"Semantic Mode cannot move the robot: {tracked.Reason}", DateTimeOffset.UtcNow);
                    return true;
                }

                // Goal only — robot Nav2 plans; grant arrives after traffic_plan uplink.
                Guid semanticCommandId;
                try
                {
                    semanticCommandId = await fleet.NavigateAsync(
                        robotId, pose.X, pose.Y, pose.Yaw, job.Id, step.Id, cancellationToken, route: null,
                        timeoutSeconds: CommandTimeoutSeconds(step));
                }
                catch (Exception ex)
                {
                    Fail(job, task, step, stepKey, "navigate_rejected", ex.Message, DateTimeOffset.UtcNow);
                    return true;
                }

                // Same bookkeeping as the Shadow path: the robot RESULT finishes the step, and the command id
                // lives in OutputValues so IsCurrentCommand can drop a superseded command's late RESULT.
                var semanticOutputs = new Dictionary<string, JsonElement>
                {
                    ["startedAt"] = JsonSerializer.SerializeToElement(now),
                    [RobotCommandIdKey] = JsonSerializer.SerializeToElement(semanticCommandId),
                    ["trafficMode"] = JsonSerializer.SerializeToElement("Semantic"),
                    ["semanticMapFingerprint"] = JsonSerializer.SerializeToElement(policy.SemanticMapFingerprint)
                };
                if (step.OutputValues.TryGetValue(SupersededCommandIdsKey, out var supersededSemantic))
                {
                    semanticOutputs[SupersededCommandIdsKey] = supersededSemantic;
                }

                step.OutputValues = semanticOutputs;
                logger.LogInformation(
                    "Job {JobNo} {StepKey} Semantic MOVE issued navigate cmd={CommandId} goal={Code} fingerprint={Fp}",
                    job.JobNo, stepKey, semanticCommandId, pose.Code, policy.SemanticMapFingerprint);
                return false;
            }

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

                var bind = await segmentedTraffic.BindGraphAsync(job.MapVersionId, graph, cancellationToken);
                if (!bind.Ok)
                {
                    Fail(job, task, step, stepKey, "traffic_graph_in_use",
                        $"Active Mode cannot switch traffic graph while robots hold resources: {bind.Reason}",
                        DateTimeOffset.UtcNow);
                    return true;
                }

                // Track the robot without touching what it already holds (station hold, the lane it stands on).
                // Quarantines are lifted only by a verified robot state or an operator, never by starting a MOVE.
                var locOk = robot.LocalizationStatus == LocalizationStatus.LOCALIZED;
                var tracked = await segmentedTraffic.EnsureTrackedAsync(
                    robotId, robot.PoseX, robot.PoseY, locOk, cancellationToken);
                if (!tracked.Ok)
                {
                    Fail(job, task, step, stepKey, TrafficRobotUnavailable,
                        $"Active Mode cannot move the robot: {tracked.Reason}", DateTimeOffset.UtcNow);
                    return true;
                }

                var purpose = step.ResolvedInputs.TryGetValue("purpose", out var purposeEl)
                    ? purposeEl.GetString()
                    : "TRANSIT";
                var policy = StationPolicyResolver.Resolve(graph, pose.Code, purpose);
                // N4: before taking the next bay, drop previous service holds the robot has physically left.
                // Keep only the holds required for this MOVE destination. T11 still protects holds during
                // safe-stop / CompleteRoute — this path runs only when starting a new MOVE with a known pose.
                if (robot.PoseX is double holdX && robot.PoseY is double holdY && locOk)
                {
                    var keep = policy.Intent?.HoldResourceIds ?? ImmutableArray<string>.Empty;
                    var stale = await segmentedTraffic.ReleaseStaleServiceHoldsAsync(
                        robotId, keep, holdX, holdY, locOk, cancellationToken);
                    if (!stale.Ok && stale.Reason is not null
                        && !stale.Reason.StartsWith("QUARANTINED", StringComparison.Ordinal))
                    {
                        logger.LogWarning(
                            "Job {JobNo} {StepKey} stale station-hold release: {Reason}",
                            job.JobNo, stepKey, stale.Reason);
                    }
                }

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
                            // StationBay wait has no wake/promote path yet — surface the hold reason
                            // instead of parking the MOVE as pendingTraffic forever.
                            Fail(
                                job,
                                task,
                                step,
                                stepKey,
                                "station_bay_unavailable",
                                $"Active Mode could not hold {rid}: {hold.Reason ?? "STATION_BUSY"}",
                                DateTimeOffset.UtcNow);
                            logger.LogWarning(
                                "Job {JobNo} {StepKey} station hold failed resource={ResourceId} reason={Reason}",
                                job.JobNo, stepKey, rid, hold.Reason);
                            return true;
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

                // Full route: the coordinator grants segment 1 now and EXTENDs the rest at each safe stop.
                var plan = await segmentedTraffic.RequestRouteAsync(new RoutePlanRequest(
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

                // Already at the destination safe-stop (zero-length path): complete MOVE without MQTT.
                if (plan.FullEdgeIds.Length == 0 || plan.Segments[0].EdgeIds.Length == 0)
                {
                    step.OutputValues = new Dictionary<string, JsonElement>
                    {
                        ["startedAt"] = JsonSerializer.SerializeToElement(now),
                        ["completedAt"] = JsonSerializer.SerializeToElement(DateTimeOffset.UtcNow),
                        ["trafficMode"] = JsonSerializer.SerializeToElement("Active"),
                        ["trafficAlreadyAtGoal"] = JsonSerializer.SerializeToElement(true),
                        ["stationPolicy"] = JsonSerializer.SerializeToElement(
                            policy.Intent?.PolicyKind.ToString() ?? "Transit")
                    };
                    SetStepStatus(job, task, step, stepKey, JobStepStatus.COMPLETED, DateTimeOffset.UtcNow);
                    logger.LogInformation(
                        "Job {JobNo} {StepKey} Active Mode already at goal; MOVE completed without NAVIGATE",
                        job.JobNo, stepKey);
                    return true;
                }

                var acquire = await segmentedTraffic.AcquireRouteAsync(
                    plan.Segments,
                    new TrafficRouteGoal(pose.X, pose.Y, pose.Yaw),
                    segmentedTraffic.Epoch,
                    cancellationToken);
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
                robotId, pose.X, pose.Y, pose.Yaw, job.Id, step.Id, cancellationToken, routeGrant,
                CommandTimeoutSeconds(step));
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
        // Do not use CompiledTrafficGraphCache.TryGetForMap: validation/debug compile with
        // occupancy (different graphHash) and would be returned here. Binding that hash while
        // reconciliation already holds the runtime (no-occupancy) graph → GRAPH_IN_USE / failed MOVE.
        if (trafficCompile is null)
        {
            return null;
        }

        try
        {
            var bundle = await trafficCompile.CompileAsync(mapVersionId, TrafficGraphCompileService.RuntimeIncludesOccupancy, cancellationToken);
            if (bundle.Result.HasErrors)
            {
                // Map editor validation can flag clearance/corridor issues while the compiled graph
                // is still usable for Active segment grants. Hard-fail only when compile throws.
                logger.LogWarning(
                    "Traffic graph for map {MapVersionId} has validation errors ({Count}); Active/Shadow MOVE will still use it",
                    mapVersionId,
                    bundle.Result.Issues.Count(i => i.Severity == TrafficIssueSeverity.Error));
            }

            return bundle.Result.Graph;
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
                // HW-04: an unknown battery fails the check; it is never read as 0 % or as full.
                var actual = robot?.BatteryPercent;
                passed = actual is { } known && known >= required;
                reason = passed ? "battery_ok"
                    : robot is null ? "robot_not_found"
                    : actual is null ? "battery_unknown"
                    : $"battery {actual}% < required {required}%";
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
        // A safety wait (traffic quarantine) is not a failure of the work: hold the Job for the operator whatever the
        // step's OnFailure says; containers stay as they are. POST /jobs/{id}/resume continues after a reconcile.
        // Safety waits (traffic quarantine, obstacle blocked ≥60s): PAUSE for resume — not a permanent failure.
        var pauseForSafety = step.ErrorCode is TrafficRobotUnavailable or NavigationBlocked;
        job.Status = pauseForSafety ? JobStatus.PAUSED : workflowStep.OnFailure switch
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

        // N4: job finished — release every service hold the robot has physically cleared (keep none).
        if (segmentedTraffic is not null && AssignedRobot(job) is Guid finishedRobotId)
        {
            var robot = await fleet.GetRobotAsync(finishedRobotId, cancellationToken);
            if (robot is { PoseX: double x, PoseY: double y }
                && robot.LocalizationStatus == LocalizationStatus.LOCALIZED)
            {
                var release = await segmentedTraffic.ReleaseStaleServiceHoldsAsync(
                    finishedRobotId, ImmutableArray<string>.Empty, x, y, true, cancellationToken);
                if (!release.Ok)
                {
                    logger.LogWarning(
                        "Job {JobNo} completed but station holds not fully released: {Reason}",
                        job.JobNo, release.Reason);
                }
            }
        }

        job.Status = JobStatus.COMPLETED;
        job.CompletedAt = DateTimeOffset.UtcNow;
        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), AssignedRobot(job), null));
        await SaveAndPublishAsync(cancellationToken);
        logger.LogInformation("Job {JobNo} COMPLETED", job.JobNo);
    }

    private static void CompleteTaskIfDone(JobTask task)
    {
        var allDone = task.JobSteps.All(s => s.Status is JobStepStatus.COMPLETED or JobStepStatus.SKIPPED);
        if (task.Status is not (JobTaskStatus.COMPLETED or JobTaskStatus.SKIPPED) && allDone)
        {
            task.Status = task.JobSteps.All(s => s.Status == JobStepStatus.SKIPPED) ? JobTaskStatus.SKIPPED : JobTaskStatus.COMPLETED;
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
        if (status is JobStepStatus.COMPLETED or JobStepStatus.FAILED or JobStepStatus.CANCELLED or JobStepStatus.SKIPPED)
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

    /// <summary>MOVE input <c>commandTimeoutSeconds</c>, sent to the robot as payload.timeoutSeconds (it cancels the Nav2 goal).</summary>
    private static double? CommandTimeoutSeconds(JobStep step) =>
        step.ResolvedInputs.TryGetValue("commandTimeoutSeconds", out var value)
        && value.ValueKind == JsonValueKind.Number
        && value.GetDouble() is > 0 and var seconds
            ? seconds
            : null;

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

    /// <summary>An operator who dispatches a robot the policy would not pick automatically (FL-02).</summary>
    public sealed record DispatchOverride(Guid? ActorId, string? Reason);

    /// <summary>FL-01 evaluation for this Job: pickup = the stop of its first task, busy = robots on other active Jobs.</summary>
    public async Task<IReadOnlyList<DispatchCandidate>> EvaluateDispatchAsync(Job job, IReadOnlySet<Guid> busyRobots, CancellationToken cancellationToken)
    {
        double? px = null, py = null;
        var firstStop = job.JobTasks.OrderBy(t => t.SequenceNo)
            .Select(t => t.ContextValues.TryGetValue("stopEndpointId", out var v) && v.ValueKind == JsonValueKind.String ? v.GetGuid() : (Guid?)null)
            .FirstOrDefault(id => id is not null);
        if (firstStop is { } stopId && await navigation.GetEndpointPoseAsync(stopId, cancellationToken) is { } pose)
        {
            px = pose.X;
            py = pose.Y;
        }

        return await fleet.EvaluateDispatchAsync(new DispatchQuery(job.MapVersionId, px, py, busyRobots), cancellationToken);
    }

    public async Task<IReadOnlyList<DispatchCandidate>> EvaluateDispatchAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        return await EvaluateDispatchAsync(job, await RobotsBusyWithOtherJobsAsync(job.Id, cancellationToken), cancellationToken);
    }

    /// <summary>
    /// HW-04: a known low battery always blocks. An unknown or stale battery blocks unless an operator overrides it
    /// with a reason (the endpoint checks dispatch.override).
    /// </summary>
    private static void EnsureBatteryAllowsDispatch(DispatchCandidate? candidate, RobotSnapshot robot, DispatchOverride? dispatchOverride)
    {
        var battery = candidate?.Reasons
            .Where(r => r is DispatchReasons.BatteryLow or DispatchReasons.BatteryUnknown or DispatchReasons.BatteryStale)
            .ToList() ?? [];
        if (battery.Count == 0)
        {
            return;
        }

        if (battery.Contains(DispatchReasons.BatteryLow))
        {
            throw new ConflictException($"Robot {robot.Code} battery is below the dispatch minimum.", DispatchReasons.BatteryLow);
        }

        if (string.IsNullOrWhiteSpace(dispatchOverride?.Reason))
        {
            throw new ConflictException(
                $"Robot {robot.Code} has no {(battery[0] == DispatchReasons.BatteryStale ? "recent " : "")}battery reading. "
                + "Dispatch it with an override and a reason if you know it is charged.",
                battery[0]);
        }
    }

    private static string DescribeRejections(IReadOnlyList<DispatchCandidate> candidates) =>
        candidates.Count == 0 ? " (no robot on this map)"
        : ": " + string.Join("; ", candidates.Take(5).Select(c => $"{c.RobotCode} {string.Join(", ", c.Reasons)}"));

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

    /// <summary>
    /// A robot with a configured home (Traffic:RobotHomeEndpoints) starts its first Job after this host started from
    /// there, localized: its map pose must agree with where the operator placed it. Later Jobs start wherever the last
    /// one ended (the workflow has no return-to-parking step). "First" = the coordinator has seen no plan from it yet.
    /// </summary>
    private async Task EnsureRobotAtHomeForFirstJobAsync(RobotSnapshot robot, Job job, CancellationToken cancellationToken)
    {
        if (trafficOptions?.Value is not { Mode: TrafficCoordinatorMode.Semantic } options
            || segmentedTraffic is null
            || !options.RobotHomeEndpoints.TryGetValue(robot.Code, out var homeCode))
        {
            return;
        }

        var snapshot = await segmentedTraffic.GetTrafficSnapshotAsync(cancellationToken);
        if (snapshot.Robots.Any(r => r.RobotId == robot.Id && r.PlanRevision > 0))
        {
            return;
        }

        EnsureRobotLocalized(robot, DateTimeOffset.UtcNow);
        var pose = await navigation.GetEndpointPoseByCodeAsync(job.MapVersionId, homeCode, cancellationToken)
            ?? throw new ConflictException(
                $"Robot {robot.Code} has home endpoint '{homeCode}', which is not on the Job's map.", "robot_home_not_on_map");
        var distance = Math.Sqrt(Math.Pow(robot.PoseX - pose.X, 2) + Math.Pow(robot.PoseY - pose.Y, 2));
        if (distance > options.RobotHomeToleranceMeters)
        {
            throw new ConflictException(
                $"Robot {robot.Code} must start at {homeCode}, but it is localized {distance:F2} m away from it "
                + $"(({robot.PoseX:F2}, {robot.PoseY:F2}) vs ({pose.X:F2}, {pose.Y:F2})). Place it there and set its pose.",
                "robot_not_at_home");
        }
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

        if (robot.MotionHeld)
        {
            throw new ConflictException($"Robot {robot.Code} holds motion after a STOP; resume the robot first.", "robot_motion_held");
        }

        if (robot.InManualMode)
        {
            throw new ConflictException($"Robot {robot.Code} is being driven by hand.", "robot_in_manual_mode");
        }
    }

    /// <summary>FailureCode of a Job an operator paused (WFX-03); Resume also releases the robot's motion hold.</summary>
    public const string OperatorPausedCode = "operator_paused";

    /// <summary>
    /// WFX-03: an operator pauses a RUNNING Job. The robot gets STOP mode PAUSE (cancel the goal, hold motion); the
    /// MOVE in progress is reopened and its command marked superseded, so the robot's CANCELED result is ignored and
    /// Resume sends a NEW move. Traffic reservations are kept: the robot is still where it stopped.
    /// The stop itself is followed through GET /api/fleet/robots/{id}/stop-state (requested / accepted / verified).
    /// </summary>
    public async Task<Job> PauseAsync(Guid jobId, string? reason, CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        if (JobActionPolicy.StateReason(JobActionPolicy.Pause, job.Status) is { } notPausable)
        {
            throw new ConflictException($"Job {job.JobNo} is {job.Status}; only a RUNNING job can be paused.", notPausable);
        }

        var workflowSteps = await db.WorkflowSteps.AsNoTracking()
            .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
            .ToDictionaryAsync(s => s.Id, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        foreach (var (task, step) in OrderedSteps(job).Where(x => x.Step.StepType == StepType.MOVE && x.Step.Status == JobStepStatus.EXECUTING))
        {
            ReopenStep(job, task, step, workflowSteps[step.WorkflowStepId].StepKey, now);
        }

        var robotId = AssignedRobot(job);
        Guid? stopCommand = robotId is { } rid
            ? await fleet.StopRobotAsync(rid, "PAUSE", string.IsNullOrWhiteSpace(reason) ? $"Job {job.JobNo} paused" : reason, cancellationToken)
            : null;

        job.Status = JobStatus.PAUSED;
        job.FailureCode = OperatorPausedCode;
        job.FailureMessage = string.IsNullOrWhiteSpace(reason)
            ? (stopCommand is null ? "Paused by an operator; the robot could not be reached (state unknown)." : "Paused by an operator.")
            : reason.Trim();
        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), robotId, job.FailureCode));
        await SaveAndPublishAsync(cancellationToken);
        logger.LogInformation("Job {JobNo} paused by operator; STOP command {CommandId}", job.JobNo, stopCommand);
        return job;
    }

    /// <summary>
    /// Operator cancel: job → CANCELLED; traffic CancelRequest (quarantine if occupied — no silent release).
    /// </summary>
    public async Task<Job> CancelJobAsync(Guid jobId, string? reason, CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        if (JobActionPolicy.StateReason(JobActionPolicy.Cancel, job.Status) is { } terminal)
        {
            throw new ConflictException($"Job {job.JobNo} is already terminal ({job.Status}).", terminal);
        }

        // WH-04: cargo on the robot is not "returned" by cancelling. Whoever cancels says where it went.
        var onboard = job.JobContainers.Count(c => c.Status == JobContainerStatus.ONBOARD);
        if (onboard > 0 && string.IsNullOrWhiteSpace(reason))
        {
            throw new DomainValidationException(
                $"Job {job.JobNo} has {onboard} container(s) on the robot. Give a reason that says where they are now.",
                "cargo_onboard_reason_required");
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

        // Active mode stops the robot through its traffic authority; every other mode needs an explicit CANCEL of
        // the running NAVIGATE, otherwise the robot keeps driving to the goal of a cancelled Job.
        if (robotId is Guid cancelRobotId
            && (trafficOptions?.Value.Mode ?? TrafficCoordinatorMode.Shadow) != TrafficCoordinatorMode.Active)
        {
            foreach (var running in OrderedSteps(job).Select(x => x.Step)
                         .Where(s => s.StepType == StepType.MOVE && s.Status == JobStepStatus.EXECUTING))
            {
                if (running.OutputValues.TryGetValue(RobotCommandIdKey, out var commandValue)
                    && commandValue.ValueKind == JsonValueKind.String)
                {
                    await fleet.CancelNavigationAsync(cancelRobotId, commandValue.GetGuid(), cancellationToken);
                }
            }
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

        // Containers follow the Job so the Transport Request details leave IN_PROGRESS (JobContainerStatusChangedHandler).
        foreach (var container in job.JobContainers.Where(c => c.Status is not (JobContainerStatus.DELIVERED
                     or JobContainerStatus.FAILED or JobContainerStatus.CANCELLED)))
        {
            SetContainerStatus(job, container, JobContainerStatus.CANCELLED, now);
        }

        job.Status = JobStatus.CANCELLED;
        job.CompletedAt = now;
        job.FailureCode = "job_cancelled";
        job.FailureMessage = reason ?? "Cancelled by operator.";
        _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), robotId, job.FailureCode));
        await SaveAndPublishAsync(cancellationToken);
        return job;
    }

    /// <summary>FailureCode of a Job paused because its request was cancelled while cargo was on the robot (WH-04).</summary>
    public const string CargoOnboardCancelCode = "request_cancelled_cargo_onboard";

    /// <summary>
    /// TRN-01 / WH-04: the request this Job carries was cancelled. Nothing picked up yet → the Job is cancelled and the
    /// warehouse is unchanged. Cargo ONBOARD → the Job is NOT cancelled (that would pretend the cargo was returned): the
    /// robot is stopped, the Job is PAUSED with <see cref="CargoOnboardCancelCode"/> and an issue asks someone to unload
    /// or deliver it; the operator then resumes (deliver) or cancels the Job with a reason. Idempotent.
    /// </summary>
    public async Task<IReadOnlyList<ContainerCancelOutcome>> CancelForTransportRequestAsync(
        Guid jobId,
        Guid transportRequestId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var job = await LoadJobAsync(jobId, cancellationToken);
        var mine = job.JobContainers.Where(c => c.TransportRequestId == transportRequestId).ToList();

        if (JobActionPolicy.StateReason(JobActionPolicy.Cancel, job.Status) is not null)
        {
            return Outcomes(mine, _ => ContainerCancelOutcome.AlreadyFinished);
        }

        var onboard = job.JobContainers.Where(c => c.Status == JobContainerStatus.ONBOARD).ToList();
        if (onboard.Count == 0)
        {
            var finishedBefore = mine.Where(c => c.Status is JobContainerStatus.DELIVERED or JobContainerStatus.FAILED).Select(c => c.Id).ToHashSet();
            await CancelJobAsync(jobId, $"Transport request cancelled: {reason}", cancellationToken);
            return Outcomes(mine, c => finishedBefore.Contains(c.Id) ? ContainerCancelOutcome.AlreadyFinished : ContainerCancelOutcome.Cancelled);
        }

        var robotId = AssignedRobot(job);
        if (job.FailureCode != CargoOnboardCancelCode)
        {
            var now = DateTimeOffset.UtcNow;
            if (job.Status == JobStatus.RUNNING)
            {
                var workflowSteps = await db.WorkflowSteps.AsNoTracking()
                    .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
                    .ToDictionaryAsync(s => s.Id, cancellationToken);
                foreach (var (task, step) in OrderedSteps(job).Where(x => x.Step.StepType == StepType.MOVE && x.Step.Status == JobStepStatus.EXECUTING))
                {
                    ReopenStep(job, task, step, workflowSteps[step.WorkflowStepId].StepKey, now);
                }

                if (robotId is { } rid)
                {
                    await fleet.StopRobotAsync(rid, "PAUSE", $"Request cancelled; Job {job.JobNo} has cargo on board", cancellationToken);
                }

                job.Status = JobStatus.PAUSED;
            }

            job.FailureCode = CargoOnboardCancelCode;
            job.FailureMessage =
                $"The transport request was cancelled while {onboard.Count} container(s) were on the robot. "
                + "Resume it to deliver them, or unload them, cancel this Job and recover each container to the shelf it is on.";
            _pendingEvents.Add(new JobStatusChanged(job.Id, job.JobNo, job.Status.ToString(), robotId, job.FailureCode));
            await SaveAndPublishAsync(cancellationToken);
            logger.LogWarning("Job {JobNo}: request cancelled with {Count} container(s) on board; held for recovery", job.JobNo, onboard.Count);
        }

        if (issueReporter is not null)
        {
            await issueReporter.ReportAsync(
                new SystemIssueDraft(
                    $"cargo-onboard:{job.Id}",
                    job.Id,
                    job.JobNo,
                    null,
                    robotId,
                    onboard.Count == 1 ? onboard[0].ContainerId : null,
                    $"Transport request cancelled while Job {job.JobNo} had {onboard.Count} container(s) on the robot. "
                    + $"Reason: {reason}. Deliver them and resume the Job, or unload them, cancel it and recover each container to its shelf.",
                    High: true,
                    TransportRequestId: transportRequestId),
                cancellationToken);
        }

        return Outcomes(mine, c => c.Status is JobContainerStatus.DELIVERED or JobContainerStatus.FAILED or JobContainerStatus.CANCELLED
            ? ContainerCancelOutcome.AlreadyFinished
            : ContainerCancelOutcome.RecoveryRequired);

        static IReadOnlyList<ContainerCancelOutcome> Outcomes(IEnumerable<JobContainer> containers, Func<JobContainer, string> outcome) =>
            containers.Select(c => new ContainerCancelOutcome(c.ContainerId, c.JobId, outcome(c))).ToList();
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
