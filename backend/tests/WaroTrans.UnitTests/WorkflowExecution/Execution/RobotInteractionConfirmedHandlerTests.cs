using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.IntegrationEvents;
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
/// Robot-button confirmation path: validation, idempotency, multi-container sequential confirms.
/// </summary>
public sealed class RobotInteractionConfirmedHandlerTests
{
    private static readonly Guid A = Guid.NewGuid(), D = Guid.NewGuid(), E = Guid.NewGuid();
    private static readonly Guid C1 = Guid.NewGuid(), C2 = Guid.NewGuid();

    private readonly FakeFleet _fleet = new();
    private readonly FakeNavigation _navigation = new();
    private readonly FakeRequestActivity _requests = new();
    private readonly RecordingEvents _events = new();
    private WorkflowExecutionDbContext _db = null!;
    private Guid _mapVersionId;

    private JobExecutionEngine Engine() =>
        new(_db, _fleet, _navigation, _requests, new StepInputResolver(), _events, NullLogger<JobExecutionEngine>.Instance);

    private RobotInteractionConfirmedHandler Handler() =>
        new(_db, Engine(), _fleet, NullLogger<RobotInteractionConfirmedHandler>.Instance);

    private RobotCommandLifecycleJobStepHandler ResultHandler() =>
        new(_db, Engine(), _events, NullLogger<RobotCommandLifecycleJobStepHandler>.Instance);

    private async Task<Guid> ProvisionAndReachPickupConfirmAsync()
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
        var jobId = result.Jobs.Single().JobId;
        await Engine().StartAsync(jobId, null);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        return jobId;
    }

    private async Task<Guid> CurrentStepIdAsync(Guid jobId)
    {
        var job = await _db.Jobs.Include(j => j.JobTasks).ThenInclude(t => t.JobSteps).SingleAsync(j => j.Id == jobId);
        return job.JobTasks.OrderBy(t => t.SequenceNo)
            .SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo))
            .First(s => s.Status != JobStepStatus.COMPLETED).Id;
    }

    private Task RobotResultAsync(Guid stepId, string outcome = "SUCCEEDED") =>
        ResultHandler().HandleAsync(new RobotCommandLifecycleChanged(
            _fleet.Commands.Last(c => c.JobStepId == stepId).CommandId, _fleet.RobotId, "RBT-SIM-01", "NAVIGATE_TO_POSE", "COMPLETED",
            null, stepId, outcome, outcome == "SUCCEEDED" ? null : "NAV_FAILED", RobotCommandLifecycleChanged.Phases.Result));

    private async Task<(Guid StepId, Guid ContainerId, Guid EndpointId)> WaitingHandoverAsync(Guid jobId)
    {
        var job = await _db.Jobs.Include(j => j.JobTasks).ThenInclude(t => t.JobSteps).SingleAsync(j => j.Id == jobId);
        var step = job.JobTasks.SelectMany(t => t.JobSteps).Single(s => s.Status == JobStepStatus.WAITING);
        return (step.Id, step.ResolvedInputs["containerId"].GetGuid(), step.ResolvedInputs["endpointId"].GetGuid());
    }

    private RobotInteractionConfirmed Evt(
        Guid jobId,
        Guid stepId,
        string type,
        Guid containerId,
        Guid endpointId,
        Guid? robotId = null,
        Guid? messageId = null) =>
        new(
            robotId ?? _fleet.RobotId,
            "RBT-SIM-01",
            messageId ?? Guid.NewGuid(),
            jobId,
            stepId,
            type,
            containerId,
            endpointId,
            DateTimeOffset.UtcNow);

    [Fact]
    public async Task Move_success_arms_pickup_confirm_on_assigned_robot()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);

        Assert.Contains(_fleet.InteractionRequests, r =>
            r.JobStepId == stepId
            && r.InteractionType == "PICKUP_CONFIRM"
            && r.ContainerId == containerId
            && r.EndpointId == endpointId
            && r.RobotId == _fleet.RobotId);
    }

    [Fact]
    public async Task Valid_pickup_confirm_completes_and_advances()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
        var messageId = Guid.NewGuid();

        await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, endpointId, messageId: messageId));

        var step = await _db.JobSteps.FindAsync(stepId);
        Assert.Equal(JobStepStatus.COMPLETED, step!.Status);
        Assert.Equal("ROBOT_BUTTON", step.OutputValues["confirmationSource"].GetString());
        Assert.Equal(_fleet.RobotId, step.OutputValues["confirmedByRobotId"].GetGuid());
        Assert.Equal(JsonValueKind.Null, step.OutputValues["confirmedBy"].ValueKind);

        var handover = await _db.HandoverConfirmations.SingleAsync(h => h.JobStepId == stepId);
        Assert.Equal(ConfirmationSource.ROBOT_BUTTON, handover.ConfirmationSource);
        Assert.Null(handover.ConfirmedBy);
        Assert.Equal(_fleet.RobotId, handover.ConfirmedByRobotId);
        Assert.Equal(messageId, handover.SourceMessageId);

        var jc = await _db.JobContainers.SingleAsync(c => c.JobId == jobId && c.ContainerId == containerId);
        Assert.Equal(JobContainerStatus.ONBOARD, jc.Status);
        Assert.NotNull(jc.LoadedAt);

        var result = Assert.Single(_fleet.InteractionResults.Where(r => r.ConfirmMessageId == messageId));
        Assert.True(result.Accepted);
        Assert.Null(result.ReasonCode);

        // Next step is either another PICKUP_CONFIRM or a MOVE — Job still RUNNING.
        Assert.Equal(JobStatus.RUNNING, (await _db.Jobs.FindAsync(jobId))!.Status);
    }

    [Fact]
    public async Task Multi_container_pickup_then_dropoff_via_button_to_completion()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();

        // PICKUP C1, C2
        for (var i = 0; i < 2; i++)
        {
            var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
            await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, endpointId));
        }

        // MOVE to D → DROPOFF C1
        Assert.True(_fleet.Commands.Count >= 2);
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        {
            var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
            Assert.Equal(C1, containerId);
            await Handler().HandleAsync(Evt(jobId, stepId, "DROPOFF_CONFIRM", containerId, endpointId));
        }

        // MOVE to E → DROPOFF C2
        await RobotResultAsync(_fleet.Commands[^1].JobStepId);
        {
            var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
            Assert.Equal(C2, containerId);
            await Handler().HandleAsync(Evt(jobId, stepId, "DROPOFF_CONFIRM", containerId, endpointId));
        }

        var job = await _db.Jobs.Include(j => j.JobContainers).SingleAsync(j => j.Id == jobId);
        Assert.Equal(JobStatus.COMPLETED, job.Status);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.DELIVERED, c.Status));
        Assert.Equal(4, await _db.HandoverConfirmations.CountAsync());
        Assert.All(await _db.HandoverConfirmations.ToListAsync(), h =>
            Assert.Equal(ConfirmationSource.ROBOT_BUTTON, h.ConfirmationSource));
    }

    [Fact]
    public async Task Wrong_robot_is_rejected()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
        var other = Guid.NewGuid();

        await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, endpointId, robotId: other));

        Assert.Equal(JobStepStatus.WAITING, (await _db.JobSteps.FindAsync(stepId))!.Status);
        Assert.False(_fleet.InteractionResults[^1].Accepted);
        Assert.Equal("interaction_wrong_robot", _fleet.InteractionResults[^1].ReasonCode);
        Assert.Empty(await _db.HandoverConfirmations.ToListAsync());
    }

    [Fact]
    public async Task Wrong_job_is_rejected()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);

        await Handler().HandleAsync(Evt(Guid.NewGuid(), stepId, "PICKUP_CONFIRM", containerId, endpointId));

        Assert.Equal(JobStepStatus.WAITING, (await _db.JobSteps.FindAsync(stepId))!.Status);
        Assert.Equal("interaction_wrong_job", _fleet.InteractionResults[^1].ReasonCode);
    }

    [Fact]
    public async Task Wrong_step_is_rejected()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (_, containerId, endpointId) = await WaitingHandoverAsync(jobId);

        await Handler().HandleAsync(Evt(jobId, Guid.NewGuid(), "PICKUP_CONFIRM", containerId, endpointId));

        Assert.Equal("interaction_step_not_found", _fleet.InteractionResults[^1].ReasonCode);
    }

    [Fact]
    public async Task Interaction_type_mismatch_is_rejected()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);

        await Handler().HandleAsync(Evt(jobId, stepId, "DROPOFF_CONFIRM", containerId, endpointId));

        Assert.Equal(JobStepStatus.WAITING, (await _db.JobSteps.FindAsync(stepId))!.Status);
        Assert.Equal("interaction_type_mismatch", _fleet.InteractionResults[^1].ReasonCode);
    }

    [Fact]
    public async Task Container_mismatch_is_rejected()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, _, endpointId) = await WaitingHandoverAsync(jobId);

        await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", C2, endpointId));

        Assert.Equal("handover_container_mismatch", _fleet.InteractionResults[^1].ReasonCode);
        Assert.Equal(0, await _db.HandoverConfirmations.CountAsync());
    }

    [Fact]
    public async Task Endpoint_mismatch_is_rejected()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, _) = await WaitingHandoverAsync(jobId);

        await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, Guid.NewGuid()));

        Assert.Equal("interaction_endpoint_mismatch", _fleet.InteractionResults[^1].ReasonCode);
    }

    [Fact]
    public async Task Confirm_during_move_is_rejected_as_not_current()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (pickupStepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
        // Complete pickup with staff so we get a MOVE EXECUTING without button.
        await Engine().ConfirmHumanStepAsync(pickupStepId, containerId, HumanConfirmationSource.StaffApp(Guid.NewGuid()));
        await Engine().ConfirmHumanStepAsync(await CurrentStepIdAsync(jobId), C2, HumanConfirmationSource.StaffApp(Guid.NewGuid()));

        // Current is MOVE EXECUTING — fake a confirm for the already-completed pickup.
        await Handler().HandleAsync(Evt(jobId, pickupStepId, "PICKUP_CONFIRM", containerId, endpointId));

        Assert.Equal("interaction_not_current", _fleet.InteractionResults[^1].ReasonCode);
        // Only one handover for that step (Staff).
        Assert.Equal(1, await _db.HandoverConfirmations.CountAsync(h => h.JobStepId == pickupStepId));
    }

    [Fact]
    public async Task Duplicate_message_after_button_confirm_is_idempotent()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
        var messageId = Guid.NewGuid();
        var evt = Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, endpointId, messageId: messageId);

        await Handler().HandleAsync(evt);
        await Handler().HandleAsync(evt);

        Assert.Equal(1, await _db.HandoverConfirmations.CountAsync(h => h.JobStepId == stepId));
        Assert.Equal(JobContainerStatus.ONBOARD,
            (await _db.JobContainers.SingleAsync(c => c.ContainerId == containerId)).Status);
        Assert.Contains(_fleet.InteractionResults, r => r.ConfirmMessageId == messageId && r.Accepted && r.ReasonCode == "ALREADY_CONFIRMED");
    }

    [Fact]
    public async Task Duplicate_press_after_completed_does_not_double_update_job_container()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);
        await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, endpointId));
        var loadedAt = (await _db.JobContainers.SingleAsync(c => c.ContainerId == containerId)).LoadedAt;

        await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, endpointId));

        var jc = await _db.JobContainers.SingleAsync(c => c.ContainerId == containerId);
        Assert.Equal(loadedAt, jc.LoadedAt);
        Assert.Equal(1, await _db.HandoverConfirmations.CountAsync(h => h.JobStepId == stepId));
    }

    [Fact]
    public async Task Button_confirm_does_not_publish_navigate_directly()
    {
        var jobId = await ProvisionAndReachPickupConfirmAsync();
        var commandsBefore = _fleet.Commands.Count;
        var (stepId, containerId, endpointId) = await WaitingHandoverAsync(jobId);

        await Handler().HandleAsync(Evt(jobId, stepId, "PICKUP_CONFIRM", containerId, endpointId));

        // Completing C1 pickup advances to C2 PICKUP_CONFIRM (WAITING), not a new MOVE.
        // So Commands count must stay the same — next MOVE only after all pickups + AdvanceAsync.
        Assert.Equal(commandsBefore, _fleet.Commands.Count);
        var next = await WaitingHandoverAsync(jobId);
        Assert.Equal("PICKUP_CONFIRM",
            (await _db.WorkflowSteps.FindAsync(
                (await _db.JobSteps.FindAsync(next.StepId))!.WorkflowStepId))!.Config.OperationCode);
    }

    // ------------------------------------------------------------------ fakes (same shape as JobExecutionEngineTests)

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
            RobotId = id;
            return id;
        }

        public Task<RobotSnapshot?> GetRobotAsync(Guid robotId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Robots.TryGetValue(robotId, out var r) ? r with { BatteryPercent = Battery } : null);

        public Task<IReadOnlyList<RobotSnapshot>> GetDispatchCandidatesAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<RobotSnapshot>>(Robots.Values.Where(r => r.CurrentMapVersionId == mapVersionId).ToList());

        public Task<Guid> NavigateAsync(Guid robotId, double x, double y, double yaw, Guid jobId, Guid jobStepId, CancellationToken cancellationToken = default)
        {
            var commandId = Guid.NewGuid();
            Commands.Add((robotId, x, y, jobStepId, commandId));
            return Task.FromResult(commandId);
        }

        public Task RequestHumanInteractionAsync(Guid robotId, Guid jobId, Guid jobStepId, string interactionType, Guid containerId, Guid endpointId, CancellationToken cancellationToken = default)
        {
            InteractionRequests.Add((robotId, jobStepId, interactionType, containerId, endpointId));
            return Task.CompletedTask;
        }

        public Task PublishInteractionResultAsync(Guid robotId, Guid jobStepId, Guid confirmMessageId, bool accepted, string? reasonCode, CancellationToken cancellationToken = default)
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
        public Task PublishAsync<TEvent>(TEvent integrationEvent, CancellationToken cancellationToken = default)
            where TEvent : IIntegrationEvent
        {
            _events.Add(integrationEvent);
            return Task.CompletedTask;
        }
    }
}
