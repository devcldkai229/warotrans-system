using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
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
/// C1 Aâ†’D, C2 Aâ†’E (shared pickup A) using the INTERNAL_RELOCATION template.
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
    private readonly FakeWarehouse _warehouse = new();
    private WorkflowExecutionDbContext _db = null!;
    private Guid _mapVersionId;

    private JobExecutionEngine Engine() =>
        new(_db, _fleet, _navigation, _requests, new StepInputResolver(), _events, NullLogger<JobExecutionEngine>.Instance, warehouse: _warehouse);

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
            .First(s => s.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED)).Id;
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

        // Robot arrives at A â†’ two PICKUP_CONFIRM (C1, C2) wait for Staff.
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff, "scan C1"));
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));

        // Both on board â†’ robot sent to D.
        Assert.Equal(2, _fleet.Commands.Count);
        Assert.Equal(9.0, _fleet.Commands[^1].X);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));

        // â†’ E
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

    [Fact]
    public async Task A_container_failing_before_pickup_leaves_the_other_to_finish_and_its_stop_is_skipped()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);

        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        await Engine().FailContainerAtStepAsync(await CurrentStepIdAsync(jobId), C2, "damaged");

        // Only D is left: the robot never drives to E, which only served C2.
        Assert.Equal(9.0, _fleet.Commands[^1].X);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));

        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.COMPLETED, job.Status);
        Assert.Equal(2, _fleet.Commands.Count);
        Assert.Equal(JobContainerStatus.DELIVERED, job.JobContainers.Single(c => c.ContainerId == C1).Status);
        var failed = job.JobContainers.Single(c => c.ContainerId == C2);
        Assert.Equal(JobContainerStatus.FAILED, failed.Status);
        Assert.Equal("damaged", failed.FailureMessage);
        Assert.NotNull(failed.FailedAt);
        Assert.Contains(_events.Of<JobContainerStatusChanged>(), e => e.ContainerId == C2 && e.Status == "FAILED");
        Assert.DoesNotContain(_events.Of<JobContainerStatusChanged>(), e => e.ContainerId == C1 && e.Status == "FAILED");
        Assert.Contains(await StepsAsync(jobId), s => s.Status == JobStepStatus.SKIPPED);
    }

    [Fact]
    public async Task A_container_failing_on_the_robot_keeps_what_was_delivered_and_raises_an_issue()
    {
        var jobId = await ProvisionAsync();
        var reporter = new RecordingIssueReporter();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);

        await EngineWith(reporter).FailContainerAtStepAsync(await CurrentStepIdAsync(jobId), C2, "wrong label");

        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.COMPLETED, job.Status);
        Assert.Equal(JobContainerStatus.DELIVERED, job.JobContainers.Single(c => c.ContainerId == C1).Status);
        Assert.Equal(JobContainerStatus.FAILED, job.JobContainers.Single(c => c.ContainerId == C2).Status);
        Assert.Equal(C2, Assert.Single(reporter.SystemDrafts).ContainerId);
    }

    [Fact]
    public async Task With_every_container_failed_and_none_delivered_the_job_has_failed()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);

        await Engine().FailContainerAtStepAsync(await CurrentStepIdAsync(jobId), C1, "missing");
        await Engine().FailContainerAtStepAsync(await CurrentStepIdAsync(jobId), C2, "missing");

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.FAILED, job.Status);
        Assert.Equal(JobExecutionEngine.ContainerReportedFailedCode, job.FailureCode);
        Assert.Single(_fleet.Commands);
    }

    [Fact]
    public async Task Only_the_container_of_the_waiting_step_can_be_reported()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);

        var stepId = await CurrentStepIdAsync(jobId);
        var error = await Assert.ThrowsAsync<DomainValidationException>(
            () => Engine().FailContainerAtStepAsync(stepId, Guid.NewGuid(), "nope"));
        Assert.Equal("handover_container_mismatch", error.Code);
    }

    [Fact]
    public async Task Cancelling_the_request_before_pickup_cancels_the_job_and_its_containers()
    {
        var jobId = await ProvisionAsync();
        var requestId = (await _db.JobContainers.FirstAsync(c => c.JobId == jobId)).TransportRequestId;

        var outcomes = await Engine().CancelForTransportRequestAsync(jobId, requestId, "wrong pallets");

        Assert.All(outcomes, o => Assert.Equal(ContainerCancelOutcome.Cancelled, o.Outcome));
        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.CANCELLED, job.Status);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.CANCELLED, c.Status));
        Assert.Empty(_fleet.Stops);
    }

    [Fact]
    public async Task Cancelling_the_request_with_cargo_on_board_holds_the_job_for_recovery()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(_staff));
        var requestId = (await _db.JobContainers.FirstAsync(c => c.JobId == jobId)).TransportRequestId;
        var reporter = new RecordingIssueReporter();

        var outcomes = await EngineWith(reporter).CancelForTransportRequestAsync(jobId, requestId, "customer cancelled");
        var again = await EngineWith(reporter).CancelForTransportRequestAsync(jobId, requestId, "customer cancelled");

        Assert.All(outcomes.Concat(again), o => Assert.Equal(ContainerCancelOutcome.RecoveryRequired, o.Outcome));
        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.PAUSED, job.Status);
        Assert.Equal(JobExecutionEngine.CargoOnboardCancelCode, job.FailureCode);
        // Nothing is treated as returned: the containers are still on the robot.
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.ONBOARD, c.Status));
        Assert.Equal((_fleet.RobotId, "PAUSE"), Assert.Single(_fleet.Stops));
        Assert.All(reporter.SystemDrafts, d => Assert.Equal($"cargo-onboard:{jobId}", d.SourceKey));

        // Closing the Job needs someone to say where the cargo is.
        var refused = await Assert.ThrowsAsync<DomainValidationException>(() => Engine().CancelJobAsync(jobId, null));
        Assert.Equal("cargo_onboard_reason_required", refused.Code);
        await Engine().CancelJobAsync(jobId, "unloaded back at A by hand");
        Assert.Equal(JobStatus.CANCELLED, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);
    }

    /// <summary>Turns the workflow step <paramref name="stepKey"/> into WAIT.DURATION of <paramref name="seconds"/>.</summary>
    private async Task MakeWaitStepAsync(string stepKey, int seconds)
    {
        var workflowStep = await _db.WorkflowSteps.FirstAsync(w => w.StepKey == stepKey);
        workflowStep.StepType = StepType.WAIT;
        workflowStep.Config = new WaroTrans.WorkflowExecution.ValueObjects.WorkflowStepConfig { OperationCode = nameof(WaitMode.DURATION) };
        workflowStep.InputBindings = new Dictionary<string, WaroTrans.WorkflowExecution.ValueObjects.StepInputBinding>
        {
            ["durationSeconds"] = new()
            {
                SourceType = WaroTrans.BuildingBlocks.Enums.BindingSourceType.CONSTANT,
                ConstantValue = JsonSerializer.SerializeToElement(seconds)
            }
        };
        foreach (var jobStep in await _db.JobSteps.Where(s => s.WorkflowStepId == workflowStep.Id).ToListAsync())
        {
            jobStep.StepType = StepType.WAIT;
        }

        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task A_wait_step_holds_the_job_until_its_deadline_and_then_advances_once()
    {
        var jobId = await ProvisionAsync();
        await MakeWaitStepAsync("CHECK_REQUEST", 3600);

        await Engine().StartAsync(jobId, null);

        Assert.Equal(JobStepStatus.WAITING, (await StepsAsync(jobId)).Single(s => s.Key == "CHECK_REQUEST").Status);
        Assert.Empty(_fleet.Commands); // nothing after the WAIT ran
        Assert.Equal(0, await Engine().WakeDueWaitStepsAsync()); // not due yet

        // The deadline passes (stored on the step, so this survives a restart).
        var wait = await _db.JobSteps.SingleAsync(s => s.Id == _db.JobSteps
            .Where(x => x.StepType == StepType.WAIT).Select(x => x.Id).First());
        wait.OutputValues = new Dictionary<string, JsonElement>(wait.OutputValues)
        {
            [JobExecutionEngine.WaitUntilKey] = JsonSerializer.SerializeToElement(DateTimeOffset.UtcNow.AddSeconds(-1))
        };
        await _db.SaveChangesAsync();

        Assert.Equal(1, await Engine().WakeDueWaitStepsAsync());
        Assert.Equal(0, await Engine().WakeDueWaitStepsAsync()); // exactly once

        var woken = await _db.JobSteps.SingleAsync(s => s.Id == wait.Id);
        Assert.Equal(JobStepStatus.COMPLETED, woken.Status);
        Assert.Equal("DURATION_ELAPSED", woken.OutputValues["resumeReason"].GetString());
        Assert.Single(_fleet.Commands); // the job moved on to MOVE_PICKUP
    }

    [Fact]
    public async Task A_cancelled_job_is_never_woken()
    {
        var jobId = await ProvisionAsync();
        await MakeWaitStepAsync("CHECK_REQUEST", 0);
        await Engine().StartAsync(jobId, null);

        await Engine().CancelJobAsync(jobId, "not needed");

        Assert.Equal(0, await Engine().WakeDueWaitStepsAsync());
        Assert.Equal(JobStepStatus.CANCELLED, (await StepsAsync(jobId)).Single(s => s.Key == "CHECK_REQUEST").Status);
        Assert.Empty(_fleet.Commands);
    }

    private sealed class FakeWarehouse : IWarehouseModule
    {
        public Dictionary<Guid, ContainerSnapshot> Containers { get; } = [];

        public void Set(Guid id, ContainerStatus status, Guid? location = null, short? level = null) =>
            Containers[id] = new ContainerSnapshot(id, "BC-" + id.ToString("N")[..4], status, location, level);

        public Task<IReadOnlyList<ContainerSnapshot>> GetContainersAsync(IReadOnlyCollection<Guid> containerIds, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<ContainerSnapshot>>(containerIds.Where(Containers.ContainsKey).Select(id => Containers[id]).ToList());

        public Task<WarehouseSnapshot?> GetWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<StorageLocationSnapshot>> GetStorageLocationsAsync(IReadOnlyCollection<Guid> storageLocationIds, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<StorageLocationSnapshot>> GetStorageLocationsByEndpointsAsync(Guid warehouseId, IReadOnlyCollection<Guid> endpointIds, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<IReadOnlyList<ContainerVoucherSnapshot>> GetConfirmedVoucherLinesAsync(IReadOnlyCollection<Guid> containerIds, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private static WaroTrans.WorkflowExecution.ValueObjects.StepInputBinding Constant(object value) => new()
    {
        SourceType = WaroTrans.BuildingBlocks.Enums.BindingSourceType.CONSTANT,
        ConstantValue = JsonSerializer.SerializeToElement(value)
    };

    /// <summary>Turns the first CHECK of the workflow into the given operation. Nothing runs after it until it passes.</summary>
    private async Task MakeCheckAsync(
        string operation,
        Dictionary<string, WaroTrans.WorkflowExecution.ValueObjects.StepInputBinding> inputs,
        int maxAttempts = 1,
        int backoffSeconds = 0,
        int timeoutSeconds = 0)
    {
        var workflowStep = await _db.WorkflowSteps.FirstAsync(w => w.StepKey == "CHECK_REQUEST");
        workflowStep.Config = new WaroTrans.WorkflowExecution.ValueObjects.WorkflowStepConfig { OperationCode = operation };
        workflowStep.InputBindings = inputs;
        workflowStep.MaxAttempts = maxAttempts;
        workflowStep.RetryBackoffSeconds = backoffSeconds;
        workflowStep.TimeoutSeconds = timeoutSeconds;
        await _db.SaveChangesAsync();
    }

    private Task MakeInventoryCheckAsync(int maxAttempts = 1, int backoffSeconds = 0, int timeoutSeconds = 0) =>
        MakeCheckAsync(
            nameof(CheckConditionCode.INVENTORY_AVAILABLE),
            new() { ["containerId"] = Constant(C1) },
            maxAttempts, backoffSeconds, timeoutSeconds);

    private async Task<WaroTrans.WorkflowExecution.Entities.JobStep> CheckStepAsync(Guid jobId)
    {
        var definition = await _db.WorkflowSteps.FirstAsync(w => w.StepKey == "CHECK_REQUEST");
        return await _db.JobSteps.FirstAsync(s => s.WorkflowStepId == definition.Id && s.JobTask.JobId == jobId);
    }

    private async Task MakeRetryDueAsync(Guid jobId)
    {
        var step = await CheckStepAsync(jobId);
        step.OutputValues = new Dictionary<string, JsonElement>(step.OutputValues)
        {
            [JobExecutionEngine.WaitUntilKey] = JsonSerializer.SerializeToElement(DateTimeOffset.UtcNow.AddSeconds(-1))
        };
        await _db.SaveChangesAsync();
    }

    [Theory]
    [InlineData(ContainerStatus.IN_TRANSIT, "container_in_transit")]
    [InlineData(ContainerStatus.HOLD, "container_hold")]
    [InlineData(ContainerStatus.ISSUED, "container_issued")]
    public async Task A_container_that_is_not_available_fails_the_check_and_nothing_moves(ContainerStatus status, string reason)
    {
        var jobId = await ProvisionAsync();
        await MakeInventoryCheckAsync();
        _warehouse.Set(C1, status);

        await Engine().StartAsync(jobId, null);

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.FAILED, job.Status);
        Assert.Equal("check_failed_inventory_available", job.FailureCode);
        Assert.Contains(reason, job.FailureMessage);
        Assert.Empty(_fleet.Commands);
    }

    [Fact]
    public async Task An_unknown_container_fails_the_check()
    {
        var jobId = await ProvisionAsync();
        await MakeInventoryCheckAsync();

        await Engine().StartAsync(jobId, null);

        Assert.Contains("container_not_found", (await _db.Jobs.SingleAsync(j => j.Id == jobId)).FailureMessage);
        Assert.Empty(_fleet.Commands);
    }

    [Fact]
    public async Task A_stored_container_that_was_moved_away_from_the_source_fails_the_check()
    {
        var jobId = await ProvisionAsync();
        await MakeInventoryCheckAsync();
        var expected = Guid.NewGuid();
        var step = await CheckStepAsync(jobId);
        var task = await _db.JobTasks.SingleAsync(t => t.Id == step.JobTaskId);
        task.ContextValues = new Dictionary<string, JsonElement>(task.ContextValues)
        {
            ["source.storageLocationId"] = JsonSerializer.SerializeToElement(expected),
            ["source.levelNo"] = JsonSerializer.SerializeToElement(2)
        };
        await _db.SaveChangesAsync();
        _warehouse.Set(C1, ContainerStatus.STORED, Guid.NewGuid(), 2);

        await Engine().StartAsync(jobId, null);

        Assert.Contains("container_not_at_source", (await _db.Jobs.SingleAsync(j => j.Id == jobId)).FailureMessage);
        Assert.Empty(_fleet.Commands);
    }

    [Fact]
    public async Task A_stored_container_at_the_source_passes_and_the_job_moves_on()
    {
        var jobId = await ProvisionAsync();
        await MakeInventoryCheckAsync();
        var shelf = Guid.NewGuid();
        var step = await CheckStepAsync(jobId);
        var task = await _db.JobTasks.SingleAsync(t => t.Id == step.JobTaskId);
        task.ContextValues = new Dictionary<string, JsonElement>(task.ContextValues)
        {
            ["source.storageLocationId"] = JsonSerializer.SerializeToElement(shelf),
            ["source.levelNo"] = JsonSerializer.SerializeToElement(1)
        };
        await _db.SaveChangesAsync();
        _warehouse.Set(C1, ContainerStatus.STORED, shelf, 1);

        await Engine().StartAsync(jobId, null);

        Assert.Equal(JobStepStatus.COMPLETED, (await CheckStepAsync(jobId)).Status);
        Assert.Single(_fleet.Commands);
    }

    [Fact]
    public async Task A_container_on_another_live_job_fails_the_check()
    {
        var jobId = await ProvisionAsync();
        await MakeInventoryCheckAsync();
        _warehouse.Set(C1, ContainerStatus.STORED);
        var mine = await _db.Jobs.AsNoTracking().SingleAsync(j => j.Id == jobId);
        var other = new WaroTrans.WorkflowExecution.Entities.Job
        {
            Id = Guid.NewGuid(),
            JobNo = "JOB-OTHER",
            ProvisioningKey = "other",
            WorkflowId = mine.WorkflowId,
            MapVersionId = mine.MapVersionId,
            Status = JobStatus.RUNNING,
            ContextValues = new Dictionary<string, JsonElement>(),
            CreatedAt = DateTimeOffset.UtcNow
        };
        other.JobContainers.Add(new WaroTrans.WorkflowExecution.Entities.JobContainer
        {
            Id = Guid.NewGuid(),
            JobId = other.Id,
            TransportRequestId = Guid.NewGuid(),
            ContainerId = C1,
            Status = JobContainerStatus.ONBOARD,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        _db.Jobs.Add(other);
        await _db.SaveChangesAsync();

        await Engine().StartAsync(jobId, null);

        Assert.Contains("container_on_another_job", (await _db.Jobs.SingleAsync(j => j.Id == jobId)).FailureMessage);
    }

    [Fact]
    public async Task A_check_waits_for_its_next_attempt_and_sees_the_change_made_meanwhile()
    {
        var jobId = await ProvisionAsync();
        await MakeInventoryCheckAsync(maxAttempts: 3, backoffSeconds: 3600);
        _warehouse.Set(C1, ContainerStatus.HOLD);

        await Engine().StartAsync(jobId, null);

        var waiting = await CheckStepAsync(jobId);
        Assert.Equal(JobStepStatus.WAITING, waiting.Status);
        Assert.Equal(1, waiting.OutputValues[JobExecutionEngine.CheckAttemptKey].GetInt32());
        Assert.Equal(JobStatus.RUNNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);
        Assert.Empty(_fleet.Commands);
        Assert.Equal(0, await Engine().WakeDueWaitStepsAsync()); // not due

        // The Container is released between the two attempts.
        _warehouse.Set(C1, ContainerStatus.STORED);
        await MakeRetryDueAsync(jobId);
        Assert.Equal(1, await Engine().WakeDueWaitStepsAsync());
        Assert.Equal(0, await Engine().WakeDueWaitStepsAsync()); // exactly once

        var done = await CheckStepAsync(jobId);
        Assert.Equal(JobStepStatus.COMPLETED, done.Status);
        Assert.Equal(2, done.OutputValues[JobExecutionEngine.CheckAttemptKey].GetInt32());
        Assert.Single(_fleet.Commands);
    }

    [Fact]
    public async Task A_check_that_uses_all_its_attempts_fails_and_a_timeout_stops_it_earlier()
    {
        var jobId = await ProvisionAsync();
        await MakeInventoryCheckAsync(maxAttempts: 2);
        _warehouse.Set(C1, ContainerStatus.HOLD);
        await Engine().StartAsync(jobId, null);
        await MakeRetryDueAsync(jobId);
        await Engine().WakeDueWaitStepsAsync();
        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.FAILED, job.Status);
        Assert.Equal("check_failed_inventory_available", job.FailureCode);
        Assert.Contains("after 2 attempts", job.FailureMessage);

        var timed = await ProvisionAsync();
        await MakeInventoryCheckAsync(maxAttempts: 5, timeoutSeconds: 60);
        await Engine().StartAsync(timed, null);
        var step = await CheckStepAsync(timed);
        step.OutputValues = new Dictionary<string, JsonElement>(step.OutputValues)
        {
            [JobExecutionEngine.WaitUntilKey] = JsonSerializer.SerializeToElement(DateTimeOffset.UtcNow.AddSeconds(-1)),
            [JobExecutionEngine.CheckFirstAttemptKey] = JsonSerializer.SerializeToElement(DateTimeOffset.UtcNow.AddMinutes(-2))
        };
        await _db.SaveChangesAsync();
        await Engine().WakeDueWaitStepsAsync();
        Assert.Equal("check_timeout", (await _db.Jobs.SingleAsync(j => j.Id == timed)).FailureCode);
        Assert.Empty(_fleet.Commands);
    }

    [Theory]
    [InlineData("EMPTY", null, false, true)]
    [InlineData("LOADED", null, false, false)]
    [InlineData("LOADED", null, true, true)]
    [InlineData("EMPTY", null, true, false)]
    [InlineData("LOADED", "C1", true, true)]
    [InlineData("LOADED", "C2", true, false)]
    public async Task Load_state_reads_the_confirmed_handovers(string expected, string? container, bool c1OnBoard, bool passes)
    {
        var jobId = await ProvisionAsync();
        var inputs = new Dictionary<string, WaroTrans.WorkflowExecution.ValueObjects.StepInputBinding>
        {
            ["robotId"] = Constant(_fleet.RobotId),
            ["expectedLoadState"] = Constant(expected)
        };
        if (container is not null)
        {
            inputs["containerId"] = Constant(container == "C1" ? C1 : C2);
        }

        await MakeCheckAsync(nameof(CheckConditionCode.LOAD_STATE), inputs);
        if (c1OnBoard)
        {
            (await _db.JobContainers.SingleAsync(c => c.JobId == jobId && c.ContainerId == C1)).Status = JobContainerStatus.ONBOARD;
            await _db.SaveChangesAsync();
        }

        await Engine().StartAsync(jobId, null);

        var step = await CheckStepAsync(jobId);
        Assert.Equal(passes ? JobStepStatus.COMPLETED : JobStepStatus.FAILED, step.Status);
        Assert.Equal("CONFIRMED_HANDOVER", step.OutputValues["loadStateSource"].GetString());
        if (!passes)
        {
            Assert.Equal("check_failed_load_state", (await _db.Jobs.SingleAsync(j => j.Id == jobId)).FailureCode);
            Assert.Empty(_fleet.Commands);
        }
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

        public List<SystemIssueDraft> SystemDrafts { get; } = [];

        public Task<Guid> ReportAsync(SystemIssueDraft draft, CancellationToken cancellationToken = default)
        {
            SystemDrafts.Add(draft);
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
    public async Task Operator_pause_stops_the_robot_and_resume_sends_a_new_move()
    {
        var jobId = await ProvisionAsync();
        await Engine().StartAsync(jobId, null);
        var (_, _, _, moveStepId, oldCommand) = _fleet.Commands[0];

        await Engine().PauseAsync(jobId, "pallet in the aisle");

        var job = await _db.Jobs.SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.PAUSED, job.Status);
        Assert.Equal(JobExecutionEngine.OperatorPausedCode, job.FailureCode);
        Assert.Equal((_fleet.RobotId, "PAUSE"), Assert.Single(_fleet.Stops));
        Assert.Equal(JobStepStatus.PENDING, (await StepsAsync(jobId)).First(s => s.Key == "MOVE_PICKUP").Status);

        // The robot cancels its goal: that CANCELED result belongs to the superseded command and changes nothing.
        await RobotResultAsync(moveStepId, outcome: "CANCELED", commandId: oldCommand);
        Assert.Equal(JobStatus.PAUSED, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);

        // Resume releases the hold first, then drives on with a new command.
        SetRobot(r => r with { MotionHeld = true });
        await Engine().ResumeAsync(jobId, null);

        Assert.Equal([_fleet.RobotId], _fleet.Resumes);
        Assert.Equal(2, _fleet.Commands.Count);
        Assert.NotEqual(oldCommand, _fleet.Commands[^1].CommandId);
        Assert.Equal(JobStatus.RUNNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);
    }

    [Fact]
    public async Task Only_a_running_job_can_be_paused()
    {
        var jobId = await ProvisionAsync();

        var ex = await Assert.ThrowsAsync<ConflictException>(() => Engine().PauseAsync(jobId, null));

        Assert.Equal("job_not_running", ex.Code);
        Assert.Empty(_fleet.Stops);
    }

    [Fact]
    public async Task A_held_robot_cannot_start_a_job()
    {
        var jobId = await ProvisionAsync();
        SetRobot(r => r with { MotionHeld = true });

        var ex = await Assert.ThrowsAsync<ConflictException>(() => Engine().StartAsync(jobId, _fleet.RobotId));

        Assert.Equal("robot_motion_held", ex.Code);
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
    public async Task Semantic_move_blocked_by_obstacle_pauses_the_job_for_resume()
    {
        var jobId = await ProvisionAsync();
        await SemanticEngine().StartAsync(jobId, null);
        var move = await _db.JobSteps.FirstAsync(s => s.Id == _fleet.Commands[0].JobStepId);

        await SemanticResultHandler().HandleAsync(new RobotCommandLifecycleChanged(
            _fleet.Commands[0].CommandId, _fleet.RobotId, "RBT-SIM-01",
            "NAVIGATE_TO_POSE", "COMPLETED", null, move.Id, "FAILED", "NAVIGATION_BLOCKED",
            RobotCommandLifecycleChanged.Phases.Result));

        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.PAUSED, job.Status);
        Assert.Equal("NAVIGATION_BLOCKED", job.FailureCode);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.ASSIGNED, c.Status));

        await SemanticEngine().ResumeAsync(jobId, null);
        Assert.Equal(JobStatus.RUNNING, (await _db.Jobs.SingleAsync(j => j.Id == jobId)).Status);
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
        Assert.Equal(9.0, _fleet.Commands[^1].X);                                       // â†’ D
        await SemanticRobotResultAsync(_fleet.Commands[^1].JobStepId);
        await SemanticEngine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C1, HumanConfirmationSource.StaffApp(_staff));
        Assert.Equal(9.5, _fleet.Commands[^1].X);                                       // â†’ E
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

        public Task<IReadOnlyList<Guid>> GetRecentJobIdsAsync(Guid robotId, int take, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<Guid>>([]);

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

        public List<(Guid RobotId, string Mode)> Stops { get; } = [];
        public List<Guid> Resumes { get; } = [];

        public Task<Guid?> StopRobotAsync(Guid robotId, string mode, string? reason, CancellationToken cancellationToken = default)
        {
            Stops.Add((robotId, mode));
            return Task.FromResult<Guid?>(Guid.NewGuid());
        }

        public Task<Guid?> ResumeRobotAsync(Guid robotId, CancellationToken cancellationToken = default)
        {
            Resumes.Add(robotId);
            if (Robots.TryGetValue(robotId, out var robot))
            {
                Robots[robotId] = robot with { MotionHeld = false };
            }

            return Task.FromResult<Guid?>(Guid.NewGuid());
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
