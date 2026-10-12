using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.Runtime;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.IntegrationTests.WorkflowExecution.JobRuntime;

[Collection(IntegrationCollection.Name)]
public sealed class JobRuntimeProvisionerIntegrationTests(WaroTransWebApplicationFactory factory)
    : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Provision_internal_relocation_multi_destination_persists_graph()
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var codes = scope.ServiceProvider.GetRequiredService<IBusinessCodeGenerator>();

        var workflow = await SeedPublishedAsync(db);
        var a = Guid.NewGuid();
        var d = Guid.NewGuid();
        var e = Guid.NewGuid();
        var f = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        var c3 = Guid.NewGuid();

        var snapshot = new TransportRequestExecutionSnapshot(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            workflow.Id,
            1,
            new Dictionary<string, JsonElement>(),
            [
                new(Guid.NewGuid(), 1, c1, Guid.NewGuid(), a, 1, Guid.NewGuid(), d, 1),
                new(Guid.NewGuid(), 2, c2, Guid.NewGuid(), a, 1, Guid.NewGuid(), e, 1),
                new(Guid.NewGuid(), 3, c3, Guid.NewGuid(), a, 1, Guid.NewGuid(), f, 1)
            ]);

        var batch = new JobBatchPlan(
            "IR-MULTI",
            1,
            [c1, c2, c3],
            [
                new JobStopPlan(1, a, JobStopAction.PICKUP, [c1, c2, c3]),
                new JobStopPlan(2, d, JobStopAction.DROPOFF, [c1]),
                new JobStopPlan(3, e, JobStopAction.DROPOFF, [c2]),
                new JobStopPlan(4, f, JobStopAction.DROPOFF, [c3])
            ]);

        var provisioner = new JobRuntimeProvisioner(db, codes);
        var result = await provisioner.ProvisionAsync(snapshot, [batch]);

        Assert.Single(result.Jobs);
        var job = await db.Jobs
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks)
            .ThenInclude(t => t.JobSteps)
            .SingleAsync(j => j.Id == result.Jobs[0].JobId);

        Assert.Equal(3, job.JobContainers.Count);
        Assert.All(job.JobTasks.SelectMany(t => t.JobSteps), s =>
        {
            Assert.Empty(s.ResolvedInputs);
            Assert.Empty(s.OutputValues);
            Assert.Null(s.TargetEndpointId);
        });
        Assert.DoesNotContain(job.ContextValues.Keys, k => k == "assignedRobotId");

        var movePickup = job.JobTasks.SelectMany(t => t.JobSteps)
            .Count(s => s.StepType == StepType.MOVE
                        && db.WorkflowSteps.Single(w => w.Id == s.WorkflowStepId).Config.OperationCode == "PICKUP");
        Assert.Equal(1, movePickup);

        var moveTask = job.JobTasks.First(t =>
            t.JobSteps.Any(s => s.StepType == StepType.MOVE
                                && db.WorkflowSteps.Single(w => w.Id == s.WorkflowStepId).Config.OperationCode == "PICKUP"));
        Assert.Equal(ExecutionScope.ONCE_PER_STOP.ToString(), moveTask.ContextValues["executionScope"].GetString());
        Assert.False(moveTask.ContextValues.ContainsKey("containerId"));
        Assert.False(moveTask.ContextValues.ContainsKey("destination.endpointId"));

        var robotId = Guid.NewGuid();
        var moveStepEntity = moveTask.JobSteps.First(s => s.StepType == StepType.MOVE);
        var wfStep = await db.WorkflowSteps.SingleAsync(s => s.Id == moveStepEntity.WorkflowStepId);

        var variableContext = new Dictionary<string, JsonElement>(job.ContextValues)
        {
            ["assignedRobotId"] = JsonSerializer.SerializeToElement(robotId)
        };
        var movement = CurrentMovementContextFactory.FromJobTaskContext(moveTask.ContextValues);
        var resolved = new StepInputResolver().Resolve(
            moveStepEntity.StepType,
            wfStep.Config.OperationCode,
            wfStep.InputBindings,
            variableContext,
            movement,
            new Dictionary<string, IReadOnlyDictionary<string, JsonElement>>());

        Assert.Equal(robotId, resolved["robotId"].GetGuid());
        Assert.Equal(a, resolved["targetEndpointId"].GetGuid());
        Assert.Equal("PICKUP", resolved["purpose"].GetString());
    }

    [Fact]
    public async Task Provision_concurrent_same_key_converges_to_one_job()
    {
        Guid workflowId;
        using (var seedScope = Factory.Services.CreateScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            workflowId = (await SeedPublishedAsync(seedDb)).Id;
        }

        var a = Guid.NewGuid();
        var d = Guid.NewGuid();
        var e = Guid.NewGuid();
        var f = Guid.NewGuid();
        var c1 = Guid.NewGuid();
        var c2 = Guid.NewGuid();
        var c3 = Guid.NewGuid();
        var transportRequestId = Guid.NewGuid();

        var snapshot = new TransportRequestExecutionSnapshot(
            transportRequestId,
            Guid.NewGuid(),
            Guid.NewGuid(),
            workflowId,
            1,
            new Dictionary<string, JsonElement>(),
            [
                new(Guid.NewGuid(), 1, c1, Guid.NewGuid(), a, 1, Guid.NewGuid(), d, 1),
                new(Guid.NewGuid(), 2, c2, Guid.NewGuid(), a, 1, Guid.NewGuid(), e, 1),
                new(Guid.NewGuid(), 3, c3, Guid.NewGuid(), a, 1, Guid.NewGuid(), f, 1)
            ]);

        var batch = new JobBatchPlan(
            "IR-CONCURRENT",
            1,
            [c1, c2, c3],
            [
                new JobStopPlan(1, a, JobStopAction.PICKUP, [c1, c2, c3]),
                new JobStopPlan(2, d, JobStopAction.DROPOFF, [c1]),
                new JobStopPlan(3, e, JobStopAction.DROPOFF, [c2]),
                new JobStopPlan(4, f, JobStopAction.DROPOFF, [c3])
            ]);

        var provisioningKey = JobRuntimeProvisioner.BuildProvisioningKey(transportRequestId, batch.BatchKey);

        var tasks = Enumerable.Range(0, 8).Select(async _ =>
        {
            using var scope = Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
            var codes = scope.ServiceProvider.GetRequiredService<IBusinessCodeGenerator>();
            var provisioner = new JobRuntimeProvisioner(db, codes);
            return await provisioner.ProvisionAsync(snapshot, [batch]);
        });

        var results = await Task.WhenAll(tasks);
        var jobIds = results.Select(r => r.Jobs.Single().JobId).Distinct().ToList();
        Assert.Single(jobIds);

        using var verifyScope = Factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var jobs = await verifyDb.Jobs
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks)
            .ThenInclude(t => t.JobSteps)
            .Where(j => j.ProvisioningKey == provisioningKey)
            .ToListAsync();

        Assert.Single(jobs);
        Assert.Equal(3, jobs[0].JobContainers.Count);
        Assert.Equal(jobIds[0], jobs[0].Id);

        // Unique index exists in the model / database.
        var index = verifyDb.Model.FindEntityType(typeof(Job))!
            .GetIndexes()
            .Single(i => i.Properties.Any(p => p.Name == nameof(Job.ProvisioningKey)));
        Assert.True(index.IsUnique);
    }

    private static async Task<Workflow> SeedPublishedAsync(WorkflowExecutionDbContext db)
    {
        var workflow = new Workflow
        {
            Id = Guid.NewGuid(),
            Code = "DEMO_INTERNAL_RELOCATION_" + Guid.NewGuid().ToString("N")[..8],
            VersionNo = 1,
            Name = "Internal Relocation IT",
            Status = WorkflowStatus.PUBLISHED,
            VariablesSchema =
            [
                Var("minBatteryPercent", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, 25m),
                Var("assignedRobotId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, null),
                Var("transportRequestId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, null),
                Var("jobId", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, null)
            ],
            CreatedBy = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            PublishedAt = DateTimeOffset.UtcNow
        };

        var pickup = new WorkflowTask
        {
            Id = Guid.NewGuid(),
            WorkflowId = workflow.Id,
            TaskKey = "PICKUP",
            Name = "Pickup",
            SequenceNo = 1
        };
        pickup.Steps.Add(Step(pickup.Id, "CHECK_READY", StepType.CHECK, "ROBOT_READY", 1,
            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId")));
        pickup.Steps.Add(Step(pickup.Id, "MOVE_PICKUP", StepType.MOVE, "PICKUP", 2,
            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"),
            BindConst("purpose", "PICKUP")));
        pickup.Steps.Add(Step(pickup.Id, "PICKUP_CONFIRM", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 3,
            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId")));

        var delivery = new WorkflowTask
        {
            Id = Guid.NewGuid(),
            WorkflowId = workflow.Id,
            TaskKey = "DELIVERY",
            Name = "Delivery",
            SequenceNo = 2
        };
        delivery.Steps.Add(Step(delivery.Id, "MOVE_DROPOFF", StepType.MOVE, "DROPOFF", 1,
            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"),
            BindConst("purpose", "DROPOFF")));
        delivery.Steps.Add(Step(delivery.Id, "DROPOFF_CONFIRM", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 2,
            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId")));

        workflow.Tasks.Add(pickup);
        workflow.Tasks.Add(delivery);
        db.Workflows.Add(workflow);
        await db.SaveChangesAsync();
        return workflow;
    }

    private static WorkflowVariableDefinition Var(
        string key,
        WorkflowDataType type,
        WorkflowVariableSource source,
        object? configured) =>
        new()
        {
            Key = key,
            Name = key,
            DataType = type,
            Source = source,
            IsRequired = true,
            ConfiguredValue = configured is null ? null : JsonSerializer.SerializeToElement(configured)
        };

    private static WorkflowStep Step(
        Guid taskId,
        string key,
        StepType type,
        string operation,
        int seq,
        params (string, StepInputBinding)[] bindings) =>
        new()
        {
            Id = Guid.NewGuid(),
            WorkflowTaskId = taskId,
            StepKey = key,
            Name = key,
            StepType = type,
            SequenceNo = seq,
            Config = new WorkflowStepConfig { OperationCode = operation },
            InputBindings = bindings.ToDictionary(b => b.Item1, b => b.Item2),
            TimeoutSeconds = 30,
            MaxAttempts = 1,
            OnFailure = StepFailurePolicy.FAIL_JOB
        };

    private static (string, StepInputBinding) Bind(string input, BindingSourceType source, string reference) =>
        (input, new StepInputBinding { SourceType = source, SourceReference = reference });

    private static (string, StepInputBinding) BindConst(string input, string value) =>
        (input, new StepInputBinding
        {
            SourceType = BindingSourceType.CONSTANT,
            ConstantValue = JsonSerializer.SerializeToElement(value)
        });
}
