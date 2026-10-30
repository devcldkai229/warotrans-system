using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Fixtures;

/// <summary>
/// InMemory WorkflowExecution DB helpers shared by Job runtime / planner tests.
/// </summary>
public static class JobRuntimeTestDb
{
    public static async Task<Job> LoadJobAsync(WorkflowExecutionDbContext db, Guid jobId) =>
        await db.Jobs
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks)
            .ThenInclude(t => t.JobSteps)
            .SingleAsync(j => j.Id == jobId);

    public static WorkflowExecutionDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<WorkflowExecutionDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new WorkflowExecutionDbContext(options);
    }

    public static async Task<Workflow> SeedPublishedInternalRelocationAsync(WorkflowExecutionDbContext db)
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
}

public sealed class FakeJobCodeGenerator : IBusinessCodeGenerator
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

    public Task<string> NextEdgeCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
        Task.FromResult("EDGE");

    public Task<string> NextZoneCodeAsync(string suffix, CancellationToken cancellationToken = default) =>
        Task.FromResult($"ZONE-{suffix}");

    public Task<string> NextRobotCodeAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult("RBT");

    public Task<string> NextContainerCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("CTN");

    public Task<string> NextRequestCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult("REQ");

    public Task<string> NextJobCodeAsync(DateOnly? day = null, CancellationToken cancellationToken = default) =>
        Task.FromResult($"JOB-TEST-{Interlocked.Increment(ref _n):D4}");
}
