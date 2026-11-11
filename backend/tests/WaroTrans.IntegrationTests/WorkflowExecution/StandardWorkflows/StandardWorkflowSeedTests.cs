using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.IntegrationTests.Infrastructure;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Planning;
using WaroTrans.WorkflowExecution.Seeding;
using WaroTrans.WorkflowExecution.Services;

namespace WaroTrans.IntegrationTests.WorkflowExecution.StandardWorkflows;

/// <summary>
/// WF-02 OUTBOUND_RETRIEVAL / WF-03 INTERNAL_RELOCATION: the seed (DRAFT, validate, PUBLISH, repeatable, never edits a
/// published version) and what the real planner + provisioner make of them for several Containers.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class StandardWorkflowSeedTests(WaroTransWebApplicationFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Seed_publishes_both_workflows_and_a_second_run_changes_nothing()
    {
        var first = await SeedAsync();
        Assert.All(first, o =>
        {
            Assert.Equal(WorkflowStatus.PUBLISHED, o.Status);
            Assert.Equal(1, o.VersionNo);
            Assert.Equal("created v1, published", o.Action);
        });

        var second = await SeedAsync();

        Assert.All(second, o => Assert.Equal("unchanged", o.Action));
        Assert.Equal(first.Select(o => o.WorkflowId), second.Select(o => o.WorkflowId));
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.Equal(2, await db.Workflows.CountAsync(w => w.Code == "OUTBOUND_RETRIEVAL" || w.Code == "INTERNAL_RELOCATION"));
    }

    [Fact]
    public async Task Seeded_workflows_use_only_move_and_human_steps_with_movement_bindings()
    {
        await SeedAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();

        foreach (var code in new[] { "OUTBOUND_RETRIEVAL", "INTERNAL_RELOCATION" })
        {
            var workflow = await db.Workflows.Include(w => w.Tasks).ThenInclude(t => t.Steps).SingleAsync(w => w.Code == code);
            var tasks = workflow.Tasks.OrderBy(t => t.SequenceNo).ToList();
            Assert.Equal(["COLLECT_CONTAINERS", "DELIVER_CONTAINERS"], tasks.Select(t => t.TaskKey));
            Assert.All(workflow.Tasks.SelectMany(t => t.Steps),
                s => Assert.Contains(s.StepType, new[] { StepType.MOVE, StepType.HUMAN_INTERACTION }));

            var collect = tasks[0].Steps.OrderBy(s => s.SequenceNo).ToList();
            Assert.Equal(("MOVE_TO_PICKUP", "PICKUP"), (collect[0].StepKey, collect[0].Config.OperationCode));
            Assert.Equal("source.endpointId", collect[0].InputBindings["targetEndpointId"].SourceReference);
            Assert.Equal(("CONFIRM_PICKUP", "PICKUP_CONFIRM"), (collect[1].StepKey, collect[1].Config.OperationCode));
            Assert.Equal("containerId", collect[1].InputBindings["containerId"].SourceReference);
            Assert.Equal("source.endpointId", collect[1].InputBindings["endpointId"].SourceReference);

            var deliver = tasks[1].Steps.OrderBy(s => s.SequenceNo).ToList();
            Assert.Equal(("MOVE_TO_DROPOFF", "DROPOFF"), (deliver[0].StepKey, deliver[0].Config.OperationCode));
            Assert.Equal("destination.endpointId", deliver[0].InputBindings["targetEndpointId"].SourceReference);
            Assert.Equal(("CONFIRM_DROPOFF", "DROPOFF_CONFIRM"), (deliver[1].StepKey, deliver[1].Config.OperationCode));
            Assert.Equal("destination.endpointId", deliver[1].InputBindings["endpointId"].SourceReference);
            Assert.All(tasks.SelectMany(t => t.Steps), s => Assert.Equal(StepFailurePolicy.PAUSE_FOR_OPERATOR, s.OnFailure));
        }
    }

    [Fact]
    public async Task A_changed_definition_becomes_a_new_version_and_the_published_one_is_not_edited()
    {
        var definition = StandardWorkflowSeeder.Definitions()[0];
        definition.Code = "SEEDTEST_" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        var v1 = Assert.Single(await SeedAsync([definition]));
        var v1Steps = await StepTimeoutsAsync(v1.WorkflowId);

        definition.Tasks[0].Steps[1].TimeoutSeconds = 600;
        var v2 = Assert.Single(await SeedAsync([definition]));
        var again = Assert.Single(await SeedAsync([definition]));

        Assert.Equal((2, WorkflowStatus.PUBLISHED, "new version v2, published"), (v2.VersionNo, v2.Status, v2.Action));
        Assert.NotEqual(v1.WorkflowId, v2.WorkflowId);
        Assert.Equal(v1Steps, await StepTimeoutsAsync(v1.WorkflowId));
        Assert.Contains(600, await StepTimeoutsAsync(v2.WorkflowId));
        Assert.Equal(("unchanged", v2.WorkflowId), (again.Action, again.WorkflowId));

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        Assert.Equal(WorkflowStatus.PUBLISHED, (await db.Workflows.SingleAsync(w => w.Id == v1.WorkflowId)).Status);
    }

    [Fact]
    public async Task A_left_over_draft_is_completed_and_published_instead_of_adding_a_version()
    {
        var definition = StandardWorkflowSeeder.Definitions()[1];
        definition.Code = "SEEDTEST_" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        Guid draftId;
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var create = scope.ServiceProvider.GetRequiredService<WaroTrans.WorkflowExecution.Features.CreateWorkflow.CreateWorkflowHandler>();
            draftId = (await create.HandleAsync(new WaroTrans.WorkflowExecution.Features.CreateWorkflow.CreateWorkflowRequest
            {
                Code = definition.Code,
                Name = "half-written draft",
                Variables = definition.Variables,
                Tasks = [definition.Tasks[0]]
            }, CancellationToken.None)).Id;
        }

        var outcome = Assert.Single(await SeedAsync([definition]));

        Assert.Equal((draftId, 1, WorkflowStatus.PUBLISHED), (outcome.WorkflowId, outcome.VersionNo, outcome.Status));
        Assert.Equal("updated draft v1, published", outcome.Action);
    }

    /// <summary>
    /// Three Containers: two share a pickup shelf and a dropoff point, one has its own. The V1 planner collects first,
    /// one MOVE per distinct stop, one confirmation per Container, each confirmation bound to its own Container.
    /// </summary>
    [Theory]
    [InlineData("OUTBOUND_RETRIEVAL")]
    [InlineData("INTERNAL_RELOCATION")]
    public async Task Several_containers_are_grouped_by_stop_and_every_confirmation_names_its_own_container(string code)
    {
        await SeedAsync();
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        var codes = scope.ServiceProvider.GetRequiredService<IBusinessCodeGenerator>();
        var workflow = await db.Workflows.SingleAsync(w => w.Code == code && w.Status == WorkflowStatus.PUBLISHED);

        Guid shelfA = Guid.NewGuid(), shelfB = Guid.NewGuid(), dropX = Guid.NewGuid(), dropY = Guid.NewGuid();
        Guid c1 = Guid.NewGuid(), c2 = Guid.NewGuid(), c3 = Guid.NewGuid();
        var snapshot = new TransportRequestExecutionSnapshot(
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), workflow.Id, 1, new Dictionary<string, JsonElement>(),
            [
                new(Guid.NewGuid(), 1, c1, Guid.NewGuid(), shelfA, null, Guid.NewGuid(), dropX, null),
                new(Guid.NewGuid(), 2, c2, Guid.NewGuid(), shelfB, null, Guid.NewGuid(), dropY, null),
                new(Guid.NewGuid(), 3, c3, Guid.NewGuid(), shelfA, null, Guid.NewGuid(), dropX, null)
            ]);

        var batches = new CollectThenDeliverJobBatchPlanner().Plan(snapshot);
        var result = await new JobRuntimeProvisioner(db, codes).ProvisionAsync(snapshot, batches);

        var job = await db.Jobs.Include(j => j.JobContainers).Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .SingleAsync(j => j.Id == Assert.Single(result.Jobs).JobId);
        var stepKeys = await db.WorkflowSteps.Where(s => s.WorkflowTask.WorkflowId == workflow.Id).ToDictionaryAsync(s => s.Id, s => s.StepKey);
        var ordered = job.JobTasks.OrderBy(t => t.SequenceNo)
            .Select(t => (Key: stepKeys[t.JobSteps.Single().WorkflowStepId], t.ContextValues))
            .ToList();

        Assert.Equal(
            ["MOVE_TO_PICKUP", "CONFIRM_PICKUP", "CONFIRM_PICKUP", "MOVE_TO_PICKUP", "CONFIRM_PICKUP",
             "MOVE_TO_DROPOFF", "CONFIRM_DROPOFF", "CONFIRM_DROPOFF", "MOVE_TO_DROPOFF", "CONFIRM_DROPOFF"],
            ordered.Select(t => t.Key));
        Assert.Equal([shelfA, shelfB], ordered.Where(t => t.Key == "MOVE_TO_PICKUP").Select(t => t.ContextValues["source.endpointId"].GetGuid()));
        Assert.Equal([dropX, dropY], ordered.Where(t => t.Key == "MOVE_TO_DROPOFF").Select(t => t.ContextValues["destination.endpointId"].GetGuid()));
        // No implicit "first Container": every confirmation carries its own.
        Assert.Equal([c1, c3, c2], ordered.Where(t => t.Key == "CONFIRM_PICKUP").Select(t => t.ContextValues["containerId"].GetGuid()));
        Assert.Equal([c1, c3, c2], ordered.Where(t => t.Key == "CONFIRM_DROPOFF").Select(t => t.ContextValues["containerId"].GetGuid()));
        Assert.All(ordered.Where(t => t.Key.StartsWith("MOVE_", StringComparison.Ordinal)), t => Assert.False(t.ContextValues.ContainsKey("containerId")));
        Assert.Equal(3, job.JobContainers.Count);
        Assert.All(job.JobContainers, c => Assert.Equal(JobContainerStatus.PENDING, c.Status));
    }

    private async Task<IReadOnlyList<WorkflowSeedOutcome>> SeedAsync(IReadOnlyList<UpsertWorkflowRequest>? definitions = null)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var seeder = scope.ServiceProvider.GetRequiredService<StandardWorkflowSeeder>();
        return definitions is null
            ? await seeder.SeedAsync(dryRun: false, CancellationToken.None)
            : await seeder.SeedAsync(definitions, dryRun: false, CancellationToken.None);
    }

    private async Task<List<int>> StepTimeoutsAsync(Guid workflowId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkflowExecutionDbContext>();
        return await db.WorkflowSteps.Where(s => s.WorkflowTask.WorkflowId == workflowId)
            .OrderBy(s => s.WorkflowTask.SequenceNo).ThenBy(s => s.SequenceNo)
            .Select(s => s.TimeoutSeconds).ToListAsync();
    }
}
