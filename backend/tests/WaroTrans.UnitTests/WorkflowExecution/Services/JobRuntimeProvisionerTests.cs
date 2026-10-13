using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.UnitTests.WorkflowExecution.Fixtures;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.Runtime;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Services;

public class JobRuntimeProvisionerTests
{
    private readonly StepInputResolver _resolver = new();

    [Fact]
    public async Task Provision_single_detail_creates_one_job_graph()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var (snapshot, batch) = BuildSingleContainerPlan(workflow.Id);

        var provisioner = new JobRuntimeProvisioner(db, new FakeJobCodeGenerator());
        var result = await provisioner.ProvisionAsync(snapshot, [batch]);

        var summary = Assert.Single(result.Jobs);
        Assert.Equal(1, summary.JobContainerCount);
        Assert.True(summary.JobTaskCount > 0);
        Assert.True(summary.JobStepCount > 0);

        var job = await LoadJobAsync(db, summary.JobId);
        Assert.Equal(JobStatus.CREATED, job.Status);
        Assert.False(string.IsNullOrWhiteSpace(job.ProvisioningKey));
        Assert.DoesNotContain(job.ContextValues.Keys, k => k == "assignedRobotId");
        Assert.All(job.JobTasks.SelectMany(t => t.JobSteps), s =>
        {
            Assert.Empty(s.ResolvedInputs);
            Assert.Empty(s.OutputValues);
            Assert.Null(s.TargetEndpointId);
        });
    }

    [Fact]
    public async Task Provision_three_containers_same_route_expands_shared_moves()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);

        var source = Guid.NewGuid();
        var dest = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        var c3 = Guid.NewGuid();
        var snapshot = BuildSnapshot(workflow.Id,
            Detail(1, c1, source, dest),
            Detail(2, c2, source, dest),
            Detail(3, c3, source, dest));

        var batch = new JobBatchPlan(
            "B1",
            1,
            [c1, c2, c3],
            [
                new JobStopPlan(1, source, JobStopAction.PICKUP, [c1, c2, c3]),
                new JobStopPlan(2, dest, JobStopAction.DROPOFF, [c1, c2, c3])
            ]);

        var result = await new JobRuntimeProvisioner(db, new FakeJobCodeGenerator())
            .ProvisionAsync(snapshot, [batch]);

        var job = await LoadJobAsync(db, result.Jobs[0].JobId);
        Assert.Equal(3, job.JobContainers.Count);

        Assert.Equal(1, CountSteps(db, job, StepType.MOVE, "PICKUP"));
        Assert.Equal(1, CountSteps(db, job, StepType.MOVE, "DROPOFF"));
        Assert.Equal(3, CountSteps(db, job, StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM"));
        Assert.Equal(3, CountSteps(db, job, StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM"));
    }

    [Fact]
    public async Task Provision_multi_destination_plan_scopes_and_contexts()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);

        var a = Guid.NewGuid();
        var d = Guid.NewGuid();
        var e = Guid.NewGuid();
        var f = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        var c3 = Guid.NewGuid();

        var snapshot = BuildSnapshot(workflow.Id,
            Detail(1, c1, a, d),
            Detail(2, c2, a, e),
            Detail(3, c3, a, f));

        var batch = new JobBatchPlan(
            "MULTI",
            1,
            [c1, c2, c3],
            [
                new JobStopPlan(1, a, JobStopAction.PICKUP, [c1, c2, c3]),
                new JobStopPlan(2, d, JobStopAction.DROPOFF, [c1]),
                new JobStopPlan(3, e, JobStopAction.DROPOFF, [c2]),
                new JobStopPlan(4, f, JobStopAction.DROPOFF, [c3])
            ]);

        var result = await new JobRuntimeProvisioner(db, new FakeJobCodeGenerator())
            .ProvisionAsync(snapshot, [batch]);

        var job = await LoadJobAsync(db, result.Jobs[0].JobId);

        // B — expansion counts
        Assert.Equal(1, CountSteps(db, job, StepType.CHECK, "ROBOT_READY"));
        Assert.Equal(1, CountSteps(db, job, StepType.CHECK, "BATTERY_MIN"));
        Assert.Equal(1, CountSteps(db, job, StepType.CHECK, "REQUEST_ACTIVE"));
        Assert.Equal(1, CountSteps(db, job, StepType.MOVE, "PICKUP"));
        Assert.Equal(3, CountSteps(db, job, StepType.MOVE, "DROPOFF"));
        Assert.Equal(3, CountSteps(db, job, StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM"));
        Assert.Equal(3, CountSteps(db, job, StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM"));
        Assert.Equal(4, CountSteps(db, job, StepType.CHECK, "ENDPOINT_AVAILABLE")); // 1 source + 3 dest

        // C — stop-level MOVE_PICKUP must not contaminate with C1 destination
        var movePickupTask = job.JobTasks.Single(t =>
            t.JobSteps.Any(s => s.StepType == StepType.MOVE
                                && OperationCode(db, s.WorkflowStepId) == "PICKUP"));
        Assert.Equal(ExecutionScope.ONCE_PER_STOP.ToString(), movePickupTask.ContextValues["executionScope"].GetString());
        Assert.False(movePickupTask.ContextValues.ContainsKey("containerId"));
        Assert.False(movePickupTask.ContextValues.ContainsKey("jobContainerId"));
        Assert.False(movePickupTask.ContextValues.ContainsKey("transportRequestDetailId"));
        Assert.False(movePickupTask.ContextValues.ContainsKey("destination.endpointId"));
        Assert.False(movePickupTask.ContextValues.ContainsKey("destination.storageLocationId"));
        Assert.Equal(a, movePickupTask.ContextValues["stopEndpointId"].GetGuid());
        Assert.Equal(a, movePickupTask.ContextValues["source.endpointId"].GetGuid());
        var stopContainers = movePickupTask.ContextValues["containerIds"].EnumerateArray().Select(x => x.GetGuid()).ToHashSet();
        Assert.Equal(new HashSet<Guid> { c1, c2, c3 }, stopContainers);

        // D — each confirm has exactly one correct container context
        var dropTasks = job.JobTasks
            .Where(t => t.JobSteps.Any(s => s.StepType == StepType.HUMAN_INTERACTION
                && OperationCode(db, s.WorkflowStepId) == "DROPOFF_CONFIRM"))
            .ToList();
        Assert.Equal(3, dropTasks.Count);
        Assert.Contains(dropTasks, t => t.ContextValues["containerId"].GetGuid() == c1
            && t.ContextValues["destination.endpointId"].GetGuid() == d
            && t.ContextValues.ContainsKey("jobContainerId")
            && t.ContextValues.ContainsKey("transportRequestDetailId")
            && t.ContextValues.ContainsKey("source.storageLocationId"));
        Assert.Contains(dropTasks, t => t.ContextValues["containerId"].GetGuid() == c2
            && t.ContextValues["destination.endpointId"].GetGuid() == e);
        Assert.Contains(dropTasks, t => t.ContextValues["containerId"].GetGuid() == c3
            && t.ContextValues["destination.endpointId"].GetGuid() == f);
    }

    [Fact]
    public async Task Provision_multi_batch_creates_multiple_jobs()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        var snapshot = BuildSnapshot(workflow.Id, Detail(1, c1, a, b), Detail(2, c2, a, b));

        var batches = new List<JobBatchPlan>
        {
            new("B1", 1, [c1], [
                new JobStopPlan(1, a, JobStopAction.PICKUP, [c1]),
                new JobStopPlan(2, b, JobStopAction.DROPOFF, [c1])
            ]),
            new("B2", 2, [c2], [
                new JobStopPlan(1, a, JobStopAction.PICKUP, [c2]),
                new JobStopPlan(2, b, JobStopAction.DROPOFF, [c2])
            ])
        };

        var result = await new JobRuntimeProvisioner(db, new FakeJobCodeGenerator())
            .ProvisionAsync(snapshot, batches);

        Assert.Equal(2, result.Jobs.Count);
        Assert.Equal(2, await db.Jobs.CountAsync());
    }

    [Fact]
    public async Task Provision_retry_is_idempotent()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var (snapshot, batch) = BuildSingleContainerPlan(workflow.Id);
        var provisioner = new JobRuntimeProvisioner(db, new FakeJobCodeGenerator());

        var first = await provisioner.ProvisionAsync(snapshot, [batch]);
        var second = await provisioner.ProvisionAsync(snapshot, [batch]);

        Assert.Equal(first.Jobs[0].JobId, second.Jobs[0].JobId);
        Assert.Equal(1, await db.Jobs.CountAsync());
    }

    [Fact]
    public async Task Provision_rejects_unknown_container_in_batch()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var (snapshot, _) = BuildSingleContainerPlan(workflow.Id);
        var bad = new JobBatchPlan(
            "BAD",
            1,
            [Guid.NewGuid()],
            [
                new JobStopPlan(1, Guid.NewGuid(), JobStopAction.PICKUP, [Guid.NewGuid()]),
                new JobStopPlan(2, Guid.NewGuid(), JobStopAction.DROPOFF, [Guid.NewGuid()])
            ]);

        await Assert.ThrowsAsync<JobPlanValidationException>(() =>
            new JobRuntimeProvisioner(db, new FakeJobCodeGenerator()).ProvisionAsync(snapshot, [bad]));
    }

    [Fact]
    public async Task Resolve_move_pickup_from_stop_scope_uses_stop_endpoint()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var (snapshot, batch) = BuildSingleContainerPlan(workflow.Id);
        var result = await new JobRuntimeProvisioner(db, new FakeJobCodeGenerator())
            .ProvisionAsync(snapshot, [batch]);

        var job = await LoadJobAsync(db, result.Jobs[0].JobId);
        var moveTask = job.JobTasks.First(t =>
            t.JobSteps.Any(s => s.StepType == StepType.MOVE && OperationCode(db, s.WorkflowStepId) == "PICKUP"));
        var moveStep = moveTask.JobSteps.First(s => s.StepType == StepType.MOVE);
        var wfStep = await db.WorkflowSteps.SingleAsync(s => s.Id == moveStep.WorkflowStepId);

        var robotId = Guid.NewGuid();
        var variableContext = new Dictionary<string, JsonElement>
        {
            ["assignedRobotId"] = JsonSerializer.SerializeToElement(robotId),
            ["minBatteryPercent"] = JsonSerializer.SerializeToElement(25m)
        };
        foreach (var (k, v) in job.ContextValues)
        {
            variableContext.TryAdd(k, v);
        }

        var movement = CurrentMovementContextFactory.FromJobTaskContext(moveTask.ContextValues);
        Assert.Equal(ExecutionScope.ONCE_PER_STOP, movement.Scope);
        Assert.Null(movement.ContainerId);

        var resolved = _resolver.Resolve(
            moveStep.StepType,
            wfStep.Config.OperationCode,
            wfStep.InputBindings,
            variableContext,
            movement,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(robotId, resolved["robotId"].GetGuid());
        Assert.Equal(movement.SourceEndpointId, resolved["targetEndpointId"].GetGuid());
        Assert.Equal("PICKUP", resolved["purpose"].GetString());
    }

    [Fact]
    public async Task Resolve_containerId_from_stop_scope_throws_scope_mismatch()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var (snapshot, batch) = BuildSingleContainerPlan(workflow.Id);
        var result = await new JobRuntimeProvisioner(db, new FakeJobCodeGenerator())
            .ProvisionAsync(snapshot, [batch]);

        var job = await LoadJobAsync(db, result.Jobs[0].JobId);
        var moveTask = job.JobTasks.First(t =>
            t.JobSteps.Any(s => s.StepType == StepType.MOVE && OperationCode(db, s.WorkflowStepId) == "PICKUP"));
        var movement = CurrentMovementContextFactory.FromJobTaskContext(moveTask.ContextValues);

        var bindings = new Dictionary<string, StepInputBinding>
        {
            ["robotId"] = new()
            {
                SourceType = BindingSourceType.WORKFLOW_VAR,
                SourceReference = "assignedRobotId"
            },
            ["containerId"] = new()
            {
                SourceType = BindingSourceType.CURRENT_MOVEMENT,
                SourceReference = "containerId"
            },
            ["endpointId"] = new()
            {
                SourceType = BindingSourceType.CURRENT_MOVEMENT,
                SourceReference = "source.endpointId"
            }
        };

        // PICKUP_CONFIRM against STOP-scope context must not silently use a first container.
        var ex = Assert.Throws<DomainValidationException>(() =>
            _resolver.Resolve(
                StepType.HUMAN_INTERACTION,
                "PICKUP_CONFIRM",
                bindings,
                new Dictionary<string, JsonElement>
                {
                    ["assignedRobotId"] = JsonSerializer.SerializeToElement(Guid.NewGuid())
                },
                movement,
                new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>()));

        Assert.Equal("current_movement_scope_mismatch", ex.Code);
    }

    [Fact]
    public async Task Validator_rejects_duplicate_container_details()
    {
        await using var db = CreateDb();
        var workflow = await SeedPublishedInternalRelocationAsync(db);
        var containerId = Guid.NewGuid();
        var ep = Guid.NewGuid();
        var snapshot = new TransportRequestExecutionSnapshot(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            workflow.Id,
            1,
            new Dictionary<string, JsonElement>(),
            [
                Detail(1, containerId, ep, ep),
                Detail(2, containerId, ep, ep)
            ]);

        await Assert.ThrowsAsync<DomainValidationException>(() =>
            new WorkflowRequestValidator(db).ValidateAsync(workflow.Id, snapshot));
    }

    private static int CountSteps(
        WorkflowExecutionDbContext db,
        Job job,
        StepType stepType,
        string operationCode) =>
        job.JobTasks.SelectMany(t => t.JobSteps)
            .Count(s => s.StepType == stepType && OperationCode(db, s.WorkflowStepId) == operationCode);

    private static string OperationCode(WorkflowExecutionDbContext db, Guid workflowStepId) =>
        db.WorkflowSteps.Single(s => s.Id == workflowStepId).Config.OperationCode;

    private static async Task<Job> LoadJobAsync(WorkflowExecutionDbContext db, Guid jobId) =>
        await db.Jobs
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks)
            .ThenInclude(t => t.JobSteps)
            .SingleAsync(j => j.Id == jobId);

    private static WorkflowExecutionDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<WorkflowExecutionDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new WorkflowExecutionDbContext(options);
    }

    private static async Task<Workflow> SeedPublishedInternalRelocationAsync(WorkflowExecutionDbContext db)
    {
        var model = InternalRelocationWorkflowFactory.CreateValid();
        var workflow = new Workflow
        {
            Id = Guid.NewGuid(),
            Code = model.Code,
            VersionNo = 1,
            Name = model.Name,
            Description = model.Description,
            Status = WorkflowStatus.PUBLISHED,
            VariablesSchema = model.Variables,
            CreatedBy = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = DateTimeOffset.UtcNow
        };

        foreach (var taskModel in model.Tasks.OrderBy(t => t.SequenceNo))
        {
            var task = new WorkflowTask
            {
                Id = Guid.NewGuid(),
                WorkflowId = workflow.Id,
                TaskKey = taskModel.TaskKey,
                Name = taskModel.Name,
                SequenceNo = taskModel.SequenceNo
            };
            foreach (var stepModel in taskModel.Steps.OrderBy(s => s.SequenceNo))
            {
                task.Steps.Add(new WorkflowStep
                {
                    Id = Guid.NewGuid(),
                    WorkflowTaskId = task.Id,
                    StepKey = stepModel.StepKey,
                    Name = stepModel.Name,
                    StepType = stepModel.StepType,
                    SequenceNo = stepModel.SequenceNo,
                    Config = new WorkflowStepConfig
                    {
                        OperationCode = stepModel.OperationCode,
                        InstructionText = stepModel.InstructionText
                    },
                    InputBindings = stepModel.InputBindings,
                    TimeoutSeconds = stepModel.TimeoutSeconds,
                    MaxAttempts = stepModel.MaxAttempts,
                    RetryBackoffSeconds = stepModel.RetryBackoffSeconds,
                    OnFailure = stepModel.OnFailure
                });
            }

            workflow.Tasks.Add(task);
        }

        db.Workflows.Add(workflow);
        await db.SaveChangesAsync();
        return workflow;
    }

    private static (TransportRequestExecutionSnapshot Snapshot, JobBatchPlan Batch) BuildSingleContainerPlan(Guid workflowId)
    {
        var source = Guid.NewGuid();
        var dest = Guid.NewGuid();
        var containerId = Guid.NewGuid();
        var snapshot = BuildSnapshot(workflowId, Detail(1, containerId, source, dest));
        var batch = new JobBatchPlan(
            "B1",
            1,
            [containerId],
            [
                new JobStopPlan(1, source, JobStopAction.PICKUP, [containerId]),
                new JobStopPlan(2, dest, JobStopAction.DROPOFF, [containerId])
            ]);
        return (snapshot, batch);
    }

    private static TransportRequestExecutionSnapshot BuildSnapshot(
        Guid workflowId,
        params TransportRequestDetailSnapshot[] details) =>
        new(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            workflowId,
            1,
            new Dictionary<string, JsonElement>(),
            details);

    private static TransportRequestDetailSnapshot Detail(
        int seq,
        Guid containerId,
        Guid source,
        Guid dest) =>
        new(
            Guid.NewGuid(),
            seq,
            containerId,
            Guid.NewGuid(),
            source,
            1,
            Guid.NewGuid(),
            dest,
            2);

    private sealed class FakeJobCodeGenerator : IBusinessCodeGenerator
    {
        private int _n;

        public Task<string> NextWarehouseCodeAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult("WH");

        public Task<string> NextCategoryCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
            Task.FromResult("CAT");

        public Task<string> NextSkuCodeAsync(string prefix, CancellationToken cancellationToken = default) =>
            Task.FromResult("SKU");

        public Task<string> NextMapVersionCodeAsync(string warehouseCode, int versionNo, CancellationToken cancellationToken = default) =>
            Task.FromResult("MAP");

        public Task<string> NextEndpointCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
            Task.FromResult("EP");

        public Task<string> NextEdgeCodeAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult("EDGE");

        public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult("RBT");

        public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
            Task.FromResult("CTN");

        public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
            Task.FromResult("REQ");

        public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
            Task.FromResult($"JOB-TEST-{Interlocked.Increment(ref _n):D4}");
    }
}
