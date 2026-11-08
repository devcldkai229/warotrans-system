using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Navigation.Contracts;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.IntegrationEventHandlers;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Planning;
using WaroTrans.WorkflowExecution.Runtime;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using static WaroTrans.UnitTests.WorkflowExecution.Fixtures.JobRuntimeTestDb;

namespace WaroTrans.UnitTests.WorkflowExecution.Execution;

/// <summary>
/// Job engine end-to-end on InMemory DB with fake Fleet / Navigation / Transportation:
/// C1 A→D, C2 A→E (shared pickup A) using the INTERNAL_RELOCATION template.
/// </summary>
public sealed class JobExecutionEngineTests
{
    private static readonly Guid A = Guid.NewGuid(), D = Guid.NewGuid(), E = Guid.NewGuid();
    private static readonly Guid C1 = Guid.NewGuid(), C2 = Guid.NewGuid();

    private readonly FakeFleet _fleet = new();
    private readonly FakeNavigation _navigation = new();
    private readonly FakeRequestActivity _requests = new();
    private readonly RecordingEvents _events = new();
    private readonly Guid _staff = Guid.NewGuid();
    private WorkflowExecutionDbContext _db = null!;
    private Guid _mapVersionId;

    private JobExecutionEngine Engine() =>
        new(_db, _fleet, _navigation, _requests, new StepInputResolver(), _events, NullLogger<JobExecutionEngine>.Instance);

    private RobotCommandLifecycleJobStepHandler ResultHandler() =>
        new(_db, Engine(), _events, NullLogger<RobotCommandLifecycleJobStepHandler>.Instance);

    private async Task<Guid> ProvisionAsync()
    {
        _db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(_db);
        _mapVersionId = Guid.NewGuid();
        foreach (var (id, x) in new[] { (A, 1.0), (D, 9.0), (E, 9.5) })
        {
            _navigation.Poses[id] = new EndpointPoseSnapshot(id, _mapVersionId, $"EP-{x}", x, 2.0, 0.0, true);
        }

        var requestId = Guid.NewGuid();
        _requests.Status = "QUEUED";
        var snapshot = new TransportRequestExecutionSnapshot(
            requestId, Guid.NewGuid(), _mapVersionId, workflow.Id, 1, new Dictionary<string, JsonElement>(),
            [
                new TransportRequestDetailSnapshot(Guid.NewGuid(), 1, C1, null, A, null, null, D, null),
                new TransportRequestDetailSnapshot(Guid.NewGuid(), 2, C2, null, A, null, null, E, null)
            ]);
        var result = await new JobRuntimeProvisioner(_db, new FakeJobCodeGenerator())
            .ProvisionAsync(snapshot, new CollectThenDeliverJobBatchPlanner().Plan(snapshot));
        _fleet.AddRobot(_mapVersionId);
        return result.Jobs.Single().JobId;
    }

    private async Task<List<(string Key, JobStepStatus Status)>> StepsAsync(Guid jobId)
    {
        var keys = await _db.WorkflowSteps.ToDictionaryAsync(s => s.Id, s => s.StepKey);
        var job = await _db.Jobs.Include(j => j.JobTasks).ThenInclude(t => t.JobSteps).SingleAsync(j => j.Id == jobId);
        return job.JobTasks.OrderBy(t => t.SequenceNo)
            .SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo))
            .Select(s => (keys[s.WorkflowStepId], s.Status))
            .ToList();
    }

    private async Task<Guid> CurrentStepIdAsync(Guid jobId)
    {
        var job = await _db.Jobs.Include(j => j.JobTasks).ThenInclude(t => t.JobSteps).SingleAsync(j => j.Id == jobId);
        return job.JobTasks.OrderBy(t => t.SequenceNo)
            .SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo))
            .First(s => s.Status != JobStepStatus.COMPLETED).Id;
    }

    /// <summary>RESULT of a MOVE step's robot command (default: the latest command issued for that step).</summary>
    private Task RobotResultAsync(Guid stepId, string outcome = "SUCCEEDED", Guid? commandId = null) =>
        ResultHandler().HandleAsync(new RobotCommandLifecycleChanged(
            commandId ?? _fleet.Commands.Last(c => c.JobStepId == stepId).CommandId, _fleet.RobotId, "RBT-SIM-01",
            "NAVIGATE_TO_POSE", "COMPLETED", null, stepId, outcome, outcome == "SUCCEEDED" ? null : "NAV_FAILED",
            RobotCommandLifecycleChanged.Phases.Result));

    /// <summary>The robot drops offline during the latest MOVE (Fleet aborts the command).</summary>
    private Task RobotOfflineAsync() =>
        ResultHandler().HandleAsync(new RobotCommandLifecycleChanged(
            _fleet.Commands[^1].CommandId, _fleet.RobotId, "RBT-SIM-01", "NAVIGATE_TO_POSE", "FAILED",
            null, _fleet.Commands[^1].JobStepId, null, "robot_offline", RobotCommandLifecycleChanged.Phases.OfflineAbort));

    /// <summary>The demo workflows use REQUEST_REASSIGN on MOVE: a lost robot leaves the Job REASSIGNING.</summary>
    private async Task MovesRequestReassignAsync()
    {
        foreach (var step in await _db.WorkflowSteps.Where(s => s.StepType == StepType.MOVE).ToListAsync())
        {
            step.OnFailure = StepFailurePolicy.REQUEST_REASSIGN;
        }

        await _db.SaveChangesAsync();
    }

    private void SetRobot(Func<RobotSnapshot, RobotSnapshot> change) =>
        _fleet.Robots[_fleet.RobotId] = change(_fleet.Robots[_fleet.RobotId]);

    [Fact]
    public async Task Start_runs_checks_and_sends_robot_to_the_pickup_stop()
    {
        var jobId = await ProvisionAsync();

        await Engine().StartAsync(jobId, null);

        var steps = await StepsAsync(jobId);
        Assert.Equal(JobStepStatus.COMPLETED, steps.Single(s => s.Key == "CHECK_READY").Status);
        Assert.Equal(JobStepStatus.COMPLETED, steps.Single(s => s.Key == "CHECK_BATTERY").Status);
        Assert.Equal(JobStepStatus.COMPLETED, steps.Single(s => s.Key == "CHECK_REQUEST").Status);
        Assert.Equal(JobStepStatus.COMPLETED, steps.First(s => s.Key == "CHECK_SOURCE_ENDPOINT").Status);
        Assert.Equal(JobStepStatus.EXECUTING, steps.First(s => s.Key == "MOVE_PICKUP").Status);

        var command = Assert.Single(_fleet.Commands);
        Assert.Equal((1.0, 2.0), (command.X, command.Y));      // endpoint A pose
        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.RUNNING, job.Status);
        Assert.Equal(_fleet.RobotId, job.ContextValues[JobExecutionEngine.AssignedRobotKey].GetGuid());
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.ASSIGNED, c.Status));
    }

    [Fact]
    public async Task Full_job_runs_moves_and_staff_confirmations_to_completion()
    {
        var jobId = await ProvisionAsync();
        var engine = Engine();
        await engine.StartAsync(jobId, null);

        // Robot arrives at A → two PICKUP_CONFIRM (C1, C2) wait for Staff.
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff, "scan C1"));
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));

        // Both on board → robot sent to D.
        Assert.Equal(2, _fleet.Commands.Count);
        Assert.Equal(9.0, _fleet.Commands[^1].X);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));

        // → E
        Assert.Equal(3, _fleet.Commands.Count);
        Assert.Equal(9.5, _fleet.Commands[^1].X);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));

        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.COMPLETED, job.Status);
        Assert.NotNull(job.CompletedAt);
        Assert.All(await StepsAsync(jobId), s => Assert.Equal(JobStepStatus.COMPLETED, s.Status));
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.DELIVERED, c.Status));
        Assert.All(await _db.JobTasks.Where(t => t.JobId == jobId).ToListAsync(),
            t => Assert.Equal(JobTaskStatus.COMPLETED, t.Status));
        Assert.Equal(4, await _db.HandoverConfirmations.CountAsync());

        // Transportation receives every container transition.
        var c1Events = _events.Of<JobContainerStatusChanged>().Where(e => e.ContainerId == C1).Select(e => e.Status);
        Assert.Equal(["ASSIGNED", "ONBOARD", "DELIVERED"], c1Events);
        Assert.Contains(_events.Of<JobStatusChanged>(), e => e.Status == "COMPLETED");

        // MOVE outputs filled from the robot result.
        var move = await _db.JobSteps.FirstAsync(s => s.Id == _fleet.Commands[0].JobStepId);
        Assert.Equal("SUCCEEDED", move.OutputValues["navigationResult"].GetString());
        Assert.Equal(A, move.OutputValues["arrivedEndpointId"].GetGuid());
    }

    private sealed class RecordingIssueReporter(Exception? failWith = null) : IIssueReporter
    {
        public List<StepIssueDraft> Drafts { get; } = [];
        public Guid IssueId { get; } = Guid.NewGuid();

        public Task<Guid> ReportFromStepAsync(StepIssueDraft draft, CancellationToken cancellationToken = default)
        {
            if (failWith is not null) throw failWith;
            Drafts.Add(draft);
            return Task.FromResult(IssueId);
        }
    }

    private JobExecutionEngine EngineWith(IIssueReporter reporter) =>
        new(_db, _fleet, _navigation, _requests, new StepInputResolver(), _events, NullLogger<JobExecutionEngine>.Instance,
            issueReporter: reporter);

    /// <summary>Turns the HUMAN step that is waiting now into a REPORT_ISSUE step.</summary>
    private async Task<Guid> WaitingReportIssueStepAsync(Guid jobId)
    {
        var stepId = await CurrentStepIdAsync(jobId);
        var step = await _db.JobSteps.SingleAsync(s => s.Id == stepId);
        var workflowStep = await _db.WorkflowSteps.SingleAsync(w => w.Id == step.WorkflowStepId);
        workflowStep.Config = new WaroTrans.WorkflowExecution.ValueObjects.WorkflowStepConfig
        {
            OperationCode = nameof(HumanActionCode.REPORT_ISSUE)
        };
        await _db.SaveChangesAsync();
        return stepId;
    }

    [Fact]
    public async Task Report_issue_step_opens_an_issue_before_it_completes()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        var stepId = await WaitingReportIssueStepAsync(jobId);
        var reporter = new RecordingIssueReporter();

        await EngineWith(reporter).ConfirmHumanStepAsync(stepId, null, HumanConfirmationSource.StaffApp(_staff, "Box crushed"));

        var draft = Assert.Single(reporter.Drafts);
        Assert.Equal(stepId, draft.JobStepId);
        Assert.Equal("Box crushed", draft.Description);
        Assert.Equal(_staff, draft.ReportedBy);
        var step = await _db.JobSteps.SingleAsync(s => s.Id == stepId);
        Assert.Equal(JobStepStatus.COMPLETED, step.Status);
        Assert.Equal(reporter.IssueId, step.OutputValues["issueId"].GetGuid());
    }

    [Fact]
    public async Task Report_issue_step_stays_waiting_when_the_issue_cannot_be_opened()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        var stepId = await WaitingReportIssueStepAsync(jobId);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            EngineWith(new RecordingIssueReporter(new InvalidOperationException("mongo down")))
                .ConfirmHumanStepAsync(stepId, null, HumanConfirmationSource.StaffApp(_staff)));

        Assert.Equal(JobStepStatus.WAITING, (await _db.JobSteps.SingleAsync(s => s.Id == stepId)).Status);
    }

    [Fact]
    public async Task Confirming_the_wrong_container_is_rejected()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        var waiting = await CurrentStepIdAsync(jobId);

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() =>
            Engine().ConfirmHumanStepAsync(waiting, C2, HumanConfirmationSource.StaffApp(_staff)));

        Assert.Equal("handover_container_mismatch", ex.Code);
        Assert.Equal(JobStepStatus.WAITING, (await _db.JobSteps.FindAsync(waiting))!.Status);
    }

    [Fact]
    public async Task Confirming_a_step_that_is_not_waiting_is_rejected()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);

        var current = await CurrentStepIdAsync(jobId);
        var ex = await Assert.ThrowsAsync<ConflictException>(() =>
            Engine().ConfirmHumanStepAsync(current, C1, HumanConfirmationSource.StaffApp(_staff)));

        Assert.Equal("job_step_not_waiting", ex.Code);
    }

    [Fact]
    public async Task Low_battery_fails_the_check_and_the_job()
    {
        var jobId = await ProvisionAsync();
        _fleet.Battery = 10m;

        await Engine().StartAsync(jobId, null);

        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.FAILED, job.Status);
        Assert.Equal("check_failed_battery_min", job.FailureCode);
        Assert.Empty(_fleet.Commands);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.FAILED, c.Status));
    }

    [Fact]
    public async Task Inactive_request_fails_the_request_check()
    {
        var jobId = await ProvisionAsync();
        _requests.Status = "CANCELLED";

        await Engine().StartAsync(jobId, null);

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.FAILED, job.Status);
        Assert.Equal("check_failed_request_active", job.FailureCode);
    }

    [Fact]
    public async Task Failed_navigation_fails_the_job_by_default_policy()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);

        await RobotResultAsync(_fleet.Commands[^1].JobStepId, "FAILED");

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.FAILED, job.Status);
        Assert.Single(_fleet.Commands);
    }

    [Fact]
    public async Task Start_requires_a_free_robot_on_the_job_map()
    {
        var jobId = await ProvisionAsync();
        _fleet.Robots.Clear();

        var ex = await Assert.ThrowsAsync<ConflictException>(() => Engine().StartAsync(jobId, null));

        Assert.Equal("no_robot_available", ex.Code);
    }

    [Fact]
    public async Task Start_with_robot_on_another_map_is_rejected()
    {
        var jobId = await ProvisionAsync();
        var other = _fleet.AddRobot(Guid.NewGuid());

        var ex = await Assert.ThrowsAsync<DomainValidationException>(() => Engine().StartAsync(jobId, other));

        Assert.Equal("robot_map_mismatch", ex.Code);
    }

    // ------------------------------------------------------------------ resume

    [Fact]
    public async Task Resume_after_robot_offline_continues_from_the_failed_move_on_the_same_robot()
    {
        var jobId = await ProvisionAsync();
        await MovesRequestReassignAsync();
        await Engine().StartAsync(jobId, null);
        await RobotOfflineAsync();
        Assert.Equal(JobStatus.REASSIGNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);

        await Engine().ResumeAsync(jobId, null);

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.RUNNING, job.Status);
        Assert.Null(job.FailureCode);
        var steps = await StepsAsync(jobId);
        Assert.Equal(JobStepStatus.EXECUTING, steps.First(s => s.Key == "MOVE_PICKUP").Status);
        Assert.All(steps.Where(s => s.Key.StartsWith("CHECK_") && s.Key != "CHECK_DEST_ENDPOINT"),
            s => Assert.Equal(JobStepStatus.COMPLETED, s.Status));
        Assert.Equal(2, _fleet.Commands.Count);                       // the same MOVE sent once more
        Assert.Equal(_fleet.RobotId, _fleet.Commands[^1].RobotId);
        Assert.Equal(1.0, _fleet.Commands[^1].X);
    }

    [Fact]
    public async Task Late_result_of_the_superseded_command_does_not_complete_the_resumed_move()
    {
        var jobId = await ProvisionAsync();
        await MovesRequestReassignAsync();
        await Engine().StartAsync(jobId, null);
        var (_, _, _, moveStepId, oldCommand) = _fleet.Commands[0];
        await RobotOfflineAsync();
        await Engine().ResumeAsync(jobId, null);

        await RobotResultAsync(moveStepId, commandId: oldCommand);    // the robot only lost Wi-Fi, old goal finished
        Assert.Equal(JobStepStatus.EXECUTING, (await StepsAsync(jobId)).First(s => s.Key == "MOVE_PICKUP").Status);

        await RobotResultAsync(moveStepId);                          // the resumed command
        Assert.Equal(JobStepStatus.WAITING, (await StepsAsync(jobId)).First(s => s.Key == "PICKUP_CONFIRM").Status);
    }

    [Fact]
    public async Task Resume_drives_back_to_the_stop_when_the_robot_came_back_elsewhere()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);       // at A
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        await PauseAsync(jobId);                                     // e.g. offline while Staff loads C2
        SetRobot(r => r with { PoseX = 5.0, PoseY = 2.0 });          // rebooted / pushed 4 m away

        await Engine().ResumeAsync(jobId, null);

        var steps = await StepsAsync(jobId);
        Assert.Equal(JobStepStatus.EXECUTING, steps.First(s => s.Key == "MOVE_PICKUP").Status);
        Assert.Equal([JobStepStatus.COMPLETED, JobStepStatus.PENDING],
            steps.Where(s => s.Key == "PICKUP_CONFIRM").Select(s => s.Status).Take(2));
        Assert.Equal(2, _fleet.Commands.Count);
        Assert.Equal((1.0, 2.0), (_fleet.Commands[^1].X, _fleet.Commands[^1].Y)); // back to A, not on to D

        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        Assert.Equal(C2, await WaitingContainerAsync(jobId));        // only C2 is asked again
    }

    [Fact]
    public async Task Resume_at_the_stop_asks_staff_again_without_moving()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await PauseAsync(jobId);
        SetRobot(r => r with { PoseX = 1.05, PoseY = 2.0 });         // still within tolerance of A

        await Engine().ResumeAsync(jobId, null);

        Assert.Single(_fleet.Commands);
        Assert.Equal(C1, await WaitingContainerAsync(jobId));
    }

    [Fact]
    public async Task Resume_is_refused_for_a_running_job()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);

        var ex = await Assert.ThrowsAsync<ConflictException>(() => Engine().ResumeAsync(jobId, null));

        Assert.Equal("job_not_resumable", ex.Code);
    }

    [Theory]
    [InlineData("not_localized", "robot_not_localized")]
    [InlineData("stale", "robot_telemetry_stale")]
    public async Task Resume_needs_a_localized_robot_with_fresh_telemetry(string robotState, string code)
    {
        var jobId = await ProvisionAsync();
        await MovesRequestReassignAsync();
        await Engine().StartAsync(jobId, null);
        await RobotOfflineAsync();
        SetRobot(r => robotState == "stale"
            ? r with { LastTelemetryAt = DateTimeOffset.UtcNow.AddMinutes(-2) }
            : r with { LocalizationStatus = LocalizationStatus.LOST });

        var ex = await Assert.ThrowsAsync<ConflictException>(() => Engine().ResumeAsync(jobId, null));

        Assert.Equal(code, ex.Code);
        Assert.Equal(JobStatus.REASSIGNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);
    }

    [Fact]
    public async Task Resume_on_another_robot_with_containers_onboard_needs_payload_recovery()
    {
        var jobId = await ProvisionAsync();
        await MovesRequestReassignAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));
        await RobotOfflineAsync();                                    // on the way to D with C1 + C2
        var other = _fleet.AddRobot(_mapVersionId);

        var ex = await Assert.ThrowsAsync<ConflictException>(() => Engine().ResumeAsync(jobId, other));

        Assert.Equal("payload_recovery_required", ex.Code);
    }

    // ------------------------------------------------------------------ Semantic traffic mode (Nav2 plans, backend grants)

    /// <summary>
    /// Engine wired like the Host with Traffic:Mode=Semantic. The bundle directory holds a manifest for
    /// <paramref name="bundleMapVersionId"/> (default: the Job's map).
    /// </summary>
    private JobExecutionEngine SemanticEngine(Guid? bundleMapVersionId = null)
    {
        var dir = Path.Combine(Path.GetTempPath(), "wt-semantic-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        _lastBundleDir = dir;
        File.WriteAllText(Path.Combine(dir, "semantic_manifest.json"), JsonSerializer.Serialize(new
        {
            mapCode = "MAP-TEST",
            mapVersionId = bundleMapVersionId ?? _mapVersionId,
            semanticMapFingerprint = "fp-test"
        }));
        File.WriteAllText(Path.Combine(dir, "single_occupancy.json"), """{"zones":[]}""");

        var options = Microsoft.Extensions.Options.Options.Create(new WaroTrans.Fleet.Traffic.TrafficOptions
        {
            Mode = WaroTrans.Fleet.Traffic.TrafficCoordinatorMode.Semantic,
            SemanticMapDirectory = dir,
            EventLogCapacity = 64
        });
        _semanticTraffic ??= new WaroTrans.Fleet.Traffic.SegmentedTrafficCoordinator(
            options, new WaroTrans.Fleet.Traffic.TrafficEventOutbox(),
            NullLogger<WaroTrans.Fleet.Traffic.SegmentedTrafficCoordinator>.Instance);
        return new JobExecutionEngine(
            _db, _fleet, _navigation, _requests, new StepInputResolver(), _events,
            NullLogger<JobExecutionEngine>.Instance,
            trafficOptions: options,
            segmentedTraffic: _semanticTraffic);
    }

    private WaroTrans.Fleet.Traffic.SegmentedTrafficCoordinator? _semanticTraffic;
    private string _lastBundleDir = "";

    private RobotCommandLifecycleJobStepHandler SemanticResultHandler() =>
        new(_db, SemanticEngine(), _events, NullLogger<RobotCommandLifecycleJobStepHandler>.Instance);

    private Task SemanticRobotResultAsync(Guid stepId, string outcome = "SUCCEEDED", Guid? commandId = null) =>
        SemanticResultHandler().HandleAsync(new RobotCommandLifecycleChanged(
            commandId ?? _fleet.Commands.Last(c => c.JobStepId == stepId).CommandId, _fleet.RobotId, "RBT-SIM-01",
            "NAVIGATE_TO_POSE", "COMPLETED", null, stepId, outcome, outcome == "SUCCEEDED" ? null : "NAV_FAILED",
            RobotCommandLifecycleChanged.Phases.Result));

    [Fact]
    public async Task Semantic_move_on_a_quarantined_robot_pauses_the_job_and_resumes_after_reconcile()
    {
        var jobId = await ProvisionAsync();
        SemanticEngine();
        await _semanticTraffic!.CompleteReconciliationAsync([]);
        await _semanticTraffic.MarkOfflineAsync(_fleet.RobotId);    // e.g. link dropped before the job started

        await SemanticEngine().StartAsync(jobId, null);

        // A safety wait, not a failed job: no motion, PAUSED whatever OnFailure says, containers untouched.
        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.PAUSED, job.Status);
        Assert.Equal("traffic_robot_unavailable", job.FailureCode);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.ASSIGNED, c.Status));
        Assert.Empty(_fleet.Commands);

        // Operator reconciles the localized robot, then resumes: the MOVE goes out.
        Assert.True((await _semanticTraffic.ReconcileRobotAsync(_fleet.RobotId, 0, 0, true, [])).Ok);
        await SemanticEngine().ResumeAsync(jobId, null);
        Assert.Equal(JobStatus.RUNNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);
        Assert.Single(_fleet.Commands);
    }

    private JobExecutionEngine HomeEngine(string homeCode)
    {
        var engine = SemanticEngine();
        var options = Microsoft.Extensions.Options.Options.Create(new WaroTrans.Fleet.Traffic.TrafficOptions
        {
            Mode = WaroTrans.Fleet.Traffic.TrafficCoordinatorMode.Semantic,
            SemanticMapDirectory = _lastBundleDir,
            EventLogCapacity = 64,
            RobotHomeEndpoints = new(StringComparer.Ordinal) { ["RBT-SIM-01"] = homeCode }
        });
        _ = engine;
        return new JobExecutionEngine(
            _db, _fleet, _navigation, _requests, new StepInputResolver(), _events,
            NullLogger<JobExecutionEngine>.Instance,
            trafficOptions: options,
            segmentedTraffic: _semanticTraffic);
    }

    private void PlaceHomeEndpoint(double x, double y)
    {
        var id = Guid.NewGuid();
        _navigation.Poses[id] = new EndpointPoseSnapshot(id, _mapVersionId, "EP-PARKING-A", x, y, 0.0, true);
    }

    [Fact]
    public async Task First_job_is_refused_unless_the_robot_is_localized_at_its_home_endpoint()
    {
        var jobId = await ProvisionAsync();
        PlaceHomeEndpoint(5.0, 5.0);
        SetRobot(r => r with { PoseX = 0, PoseY = 0 });

        var ex = await Assert.ThrowsAsync<ConflictException>(() => HomeEngine("EP-PARKING-A").StartAsync(jobId, null));

        Assert.Equal("robot_not_at_home", ex.Code);
        Assert.Empty(_fleet.Commands);
        Assert.NotEqual(JobStatus.RUNNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);

        // Placed and localized there (within tolerance): it starts.
        SetRobot(r => r with { PoseX = 5.1, PoseY = 4.9 });
        await HomeEngine("EP-PARKING-A").StartAsync(jobId, null);
        Assert.Equal(JobStatus.RUNNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);
        Assert.Single(_fleet.Commands);
    }

    [Fact]
    public async Task First_job_is_refused_when_the_robot_is_not_localized_or_the_home_is_not_on_the_map()
    {
        var jobId = await ProvisionAsync();
        var missing = await Assert.ThrowsAsync<ConflictException>(() => HomeEngine("EP-NOT-THERE").StartAsync(jobId, null));
        Assert.Equal("robot_home_not_on_map", missing.Code);

        PlaceHomeEndpoint(0, 0);
        SetRobot(r => r with { PoseX = 0, PoseY = 0, LocalizationStatus = LocalizationStatus.LOST });
        var lost = await Assert.ThrowsAsync<ConflictException>(() => HomeEngine("EP-PARKING-A").StartAsync(jobId, null));
        Assert.Equal("robot_not_localized", lost.Code);
        Assert.Empty(_fleet.Commands);
    }

    [Fact]
    public async Task Semantic_move_with_stale_telemetry_pauses_instead_of_trusting_the_stored_pose()
    {
        var jobId = await ProvisionAsync();
        SetRobot(r => r with { LastTelemetryAt = DateTimeOffset.UtcNow.AddMinutes(-1) });

        await SemanticEngine().StartAsync(jobId, null);

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.PAUSED, job.Status);
        Assert.Equal("traffic_robot_unavailable", job.FailureCode);
        Assert.Empty(_fleet.Commands);
    }

    [Fact]
    public async Task Semantic_move_waits_for_the_robot_before_asking_staff()
    {
        var jobId = await ProvisionAsync();

        await SemanticEngine().StartAsync(jobId, null);

        var started = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Null(started.FailureMessage);
        // Was: the Semantic branch reported the MOVE as finished, so PICKUP_CONFIRM was armed while driving.
        var steps = await StepsAsync(jobId);
        Assert.Equal(JobStepStatus.EXECUTING, steps.First(s => s.Key == "MOVE_PICKUP").Status);
        Assert.All(steps.Where(s => s.Key == "PICKUP_CONFIRM"), s => Assert.Equal(JobStepStatus.PENDING, s.Status));
        Assert.Empty(_fleet.InteractionRequests);
        Assert.Single(_fleet.Commands);

        var move = await _db.JobSteps.FirstAsync(s => s.Id == _fleet.Commands[0].JobStepId);
        Assert.Equal(_fleet.Commands[0].CommandId, move.OutputValues["robotCommandId"].GetGuid());
        Assert.Equal("Semantic", move.OutputValues["trafficMode"].GetString());

        await SemanticRobotResultAsync(move.Id);

        steps = await StepsAsync(jobId);
        Assert.Equal(JobStepStatus.WAITING, steps.First(s => s.Key == "PICKUP_CONFIRM").Status);
        Assert.Single(_fleet.InteractionRequests);
    }

    [Fact]
    public async Task Semantic_job_with_two_containers_runs_to_completion_and_closes_every_task()
    {
        var jobId = await ProvisionAsync();
        await SemanticEngine().StartAsync(jobId, null);

        await SemanticRobotResultAsync(_fleet.Commands[^1].JobStepId);                  // at A
        await SemanticEngine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        await SemanticEngine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));
        Assert.Equal(9.0, _fleet.Commands[^1].X);                                       // → D
        await SemanticRobotResultAsync(_fleet.Commands[^1].JobStepId);
        await SemanticEngine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        Assert.Equal(9.5, _fleet.Commands[^1].X);                                       // → E
        await SemanticRobotResultAsync(_fleet.Commands[^1].JobStepId);
        await SemanticEngine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));

        var job = await _db.Jobs.Include(j => j.JobContainers).Include(j => j.JobTasks)
            .SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.COMPLETED, job.Status);
        Assert.Equal(3, _fleet.Commands.Count);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.DELIVERED, c.Status));
        // Was: the stop tasks whose last step is a MOVE stayed RUNNING after the Job completed.
        Assert.All(job.JobTasks, t => Assert.Equal(JobTaskStatus.COMPLETED, t.Status));
        Assert.Equal(["ASSIGNED", "ONBOARD", "DELIVERED"],
            _events.Of<JobContainerStatusChanged>().Where(e => e.ContainerId == C2).Select(e => e.Status));
    }

    [Fact]
    public async Task Semantic_move_against_a_bundle_of_another_map_fails_without_moving()
    {
        var jobId = await ProvisionAsync();

        await SemanticEngine(bundleMapVersionId: Guid.NewGuid()).StartAsync(jobId, null);

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.FAILED, job.Status);
        Assert.Equal("semantic_map_mismatch", job.FailureCode);
        Assert.Empty(_fleet.Commands);
    }

    [Fact]
    public async Task Semantic_late_result_of_a_superseded_command_does_not_complete_the_resumed_move()
    {
        var jobId = await ProvisionAsync();
        await MovesRequestReassignAsync();
        await SemanticEngine().StartAsync(jobId, null);
        var (_, _, _, moveStepId, oldCommand) = _fleet.Commands[0];
        await SemanticResultHandler().HandleAsync(new RobotCommandLifecycleChanged(
            oldCommand, _fleet.RobotId, "RBT-SIM-01", "NAVIGATE_TO_POSE", "FAILED",
            null, moveStepId, null, "robot_offline", RobotCommandLifecycleChanged.Phases.OfflineAbort));
        await SemanticEngine().ResumeAsync(jobId, null);

        await SemanticRobotResultAsync(moveStepId, commandId: oldCommand);
        Assert.Equal(JobStepStatus.EXECUTING, (await StepsAsync(jobId)).First(s => s.Key == "MOVE_PICKUP").Status);

        await SemanticRobotResultAsync(moveStepId);
        Assert.Equal(JobStepStatus.WAITING, (await StepsAsync(jobId)).First(s => s.Key == "PICKUP_CONFIRM").Status);
    }

    [Fact]
    public async Task Cancelling_a_semantic_job_stops_the_robot_and_releases_the_containers()
    {
        var jobId = await ProvisionAsync();
        await SemanticEngine().StartAsync(jobId, null);
        var running = _fleet.Commands[^1];

        await SemanticEngine().CancelJobAsync(jobId, "operator test");

        // Was: no CANCEL left the backend outside Active mode, so the robot kept driving to the goal.
        Assert.Equal([(_fleet.RobotId, running.CommandId)], _fleet.Cancels);
        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.CANCELLED, job.Status);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.CANCELLED, c.Status));
        Assert.Contains(_events.Of<JobContainerStatusChanged>(), e => e.ContainerId == C1 && e.Status == "CANCELLED");
    }

    [Fact]
    public async Task Move_command_timeout_input_reaches_the_robot_command()
    {
        var jobId = await ProvisionAsync();
        foreach (var move in await _db.WorkflowSteps.Where(s => s.StepType == StepType.MOVE).ToListAsync())
        {
            move.InputBindings = new Dictionary<string, WaroTrans.WorkflowExecution.ValueObjects.StepInputBinding>(move.InputBindings)
            {
                ["commandTimeoutSeconds"] = new()
                {
                    SourceType = WaroTrans.BuildingBlocks.Enums.BindingSourceType.CONSTANT,
                    ConstantValue = JsonSerializer.SerializeToElement(360)
                }
            };
        }

        await _db.SaveChangesAsync();

        await SemanticEngine().StartAsync(jobId, null);

        Assert.Equal([360.0], _fleet.Timeouts);
    }

    private async Task PauseAsync(Guid jobId)
    {
        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        job.Status = JobStatus.PAUSED;
        await _db.SaveChangesAsync();
    }

    private async Task<Guid> WaitingContainerAsync(Guid jobId)
    {
        var job = await _db.Jobs.Include(j => j.JobTasks).ThenInclude(t => t.JobSteps).SingleAsync(j => j.Id == jobId);
        var waiting = job.JobTasks.SelectMany(t => t.JobSteps).Single(s => s.Status == JobStepStatus.WAITING);
        return waiting.ResolvedInputs["containerId"].GetGuid();
    }

    // ------------------------------------------------------------------ fakes

    private sealed class FakeFleet : IFleetModule
    {
        public Dictionary<Guid, RobotSnapshot> Robots { get; } = [];
        public List<(Guid RobotId, double X, double Y, Guid JobStepId, Guid CommandId)> Commands { get; } = [];
        public List<(Guid RobotId, Guid JobStepId, string InteractionType, Guid ContainerId, Guid EndpointId)> InteractionRequests { get; } = [];
        public List<(Guid RobotId, Guid JobStepId, Guid ConfirmMessageId, bool Accepted, string? ReasonCode)> InteractionResults { get; } = [];
        public Guid RobotId { get; private set; }
        public decimal Battery { get; set; } = 90m;

        public Guid AddRobot(Guid mapVersionId)
        {
            var id = Guid.NewGuid();
            Robots[id] = new RobotSnapshot(id, "RBT-SIM-01", Guid.NewGuid(), mapVersionId, RobotStatus.AVAILABLE, true, true,
                LocalizationStatus.LOCALIZED, NavigationStatus.IDLE, 90m, DateTimeOffset.UtcNow, 0, 0, 0);
            if (RobotId == Guid.Empty)
            {
                RobotId = id;
            }

            return id;
        }

        public Task<RobotSnapshot?> GetRobotAsync(Guid robotId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Robots.TryGetValue(robotId, out var r) ? r with { BatteryPercent = Battery } : null);

        public Task<IReadOnlyList<RobotSnapshot>> GetDispatchCandidatesAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<RobotSnapshot>>(Robots.Values.Where(r => r.CurrentMapVersionId == mapVersionId).ToList());

        public Task<Guid> NavigateAsync(
            Guid robotId,
            double x,
            double y,
            double yaw,
            Guid jobId,
            Guid jobStepId,
            CancellationToken cancellationToken = default,
            RouteGrantSnapshot? route = null,
            double? timeoutSeconds = null)
        {
            var commandId = Guid.NewGuid();
            Commands.Add((robotId, x, y, jobStepId, commandId));
            Timeouts.Add(timeoutSeconds);
            return Task.FromResult(commandId);
        }

        public List<double?> Timeouts { get; } = [];
        public List<(Guid RobotId, Guid CommandId)> Cancels { get; } = [];

        public Task<bool> CancelNavigationAsync(Guid robotId, Guid navigateCommandId, CancellationToken cancellationToken = default)
        {
            Cancels.Add((robotId, navigateCommandId));
            return Task.FromResult(true);
        }

        public Task RequestHumanInteractionAsync(
            Guid robotId,
            Guid jobId,
            Guid jobStepId,
            string interactionType,
            Guid containerId,
            Guid endpointId,
            CancellationToken cancellationToken = default)
        {
            InteractionRequests.Add((robotId, jobStepId, interactionType, containerId, endpointId));
            return Task.CompletedTask;
        }

        public Task PublishInteractionResultAsync(
            Guid robotId,
            Guid jobStepId,
            Guid confirmMessageId,
            bool accepted,
            string? reasonCode,
            CancellationToken cancellationToken = default)
        {
            InteractionResults.Add((robotId, jobStepId, confirmMessageId, accepted, reasonCode));
            return Task.CompletedTask;
        }
    }

    private sealed class FakeNavigation : INavigationModule
    {
        public Dictionary<Guid, EndpointPoseSnapshot> Poses { get; } = [];

        public Task<EndpointPoseSnapshot?> GetEndpointPoseAsync(Guid endpointId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Poses.GetValueOrDefault(endpointId));

        public Task<MapVersionSnapshot?> GetMapVersionAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
            Task.FromResult<MapVersionSnapshot?>(null);

        public Task<IReadOnlyList<EndpointSnapshot>> GetEndpointsAsync(IReadOnlyCollection<Guid> endpointIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<EndpointSnapshot>>([]);

        public Task<EndpointPoseSnapshot?> GetEndpointPoseByCodeAsync(Guid mapVersionId, string code, CancellationToken cancellationToken = default) =>
            Task.FromResult(Poses.Values.FirstOrDefault(p => p.MapVersionId == mapVersionId && p.Code == code));
    }

    private sealed class FakeRequestActivity : ITransportRequestActivityQuery
    {
        public string? Status { get; set; }

        public Task<string?> GetStatusAsync(Guid transportRequestId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Status);
    }

    private sealed class RecordingEvents : IIntegrationEventPublisher
    {
        private readonly List<IIntegrationEvent> _events = [];

        public IEnumerable<T> Of<T>() => _events.OfType<T>();

        public Task PublishAsync<TEvent>(TEvent integrationEvent, CancellationToken cancellationToken = default)
            where TEvent : IIntegrationEvent
        {
            _events.Add(integrationEvent);
            return Task.CompletedTask;
        }
    }
}
