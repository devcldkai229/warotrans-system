using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Persistence.CodeSequences;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Services;

public sealed class JobRuntimeProvisioner(
    WorkflowExecutionDbContext db,
    IBusinessCodeGenerator codeGenerator) : IJobRuntimeProvisioner
{
    public async Task<ProvisionJobRuntimeResult> ProvisionAsync(
        TransportRequestExecutionSnapshot request,
        IReadOnlyList<JobBatchPlan> batches,
        CancellationToken cancellationToken = default)
    {
        if (request.MapVersionId == Guid.Empty)
        {
            throw new DomainValidationException("MapVersionId is required.", "map_version_id_required");
        }

        JobBatchPlanValidator.ValidateOrThrow(request, batches);

        var workflow = await db.Workflows
            .Include(w => w.Tasks)
            .ThenInclude(t => t.Steps)
            .FirstOrDefaultAsync(w => w.Id == request.WorkflowId, cancellationToken)
            ?? throw new NotFoundException($"Workflow '{request.WorkflowId}' was not found.", "workflow_not_found");

        if (workflow.Status != WorkflowStatus.PUBLISHED)
        {
            throw new DomainValidationException(
                $"Workflow must be PUBLISHED (current: {workflow.Status}).",
                "workflow_not_published");
        }

        var orderedTasks = workflow.Tasks.OrderBy(t => t.SequenceNo).ToList();
        var detailsByContainer = request.Details.ToDictionary(d => d.ContainerId);
        var summaries = new List<ProvisionedJobSummary>();

        foreach (var batch in batches.OrderBy(b => b.SequenceNo))
        {
            summaries.Add(await ProvisionBatchAsync(
                request,
                batch,
                orderedTasks,
                detailsByContainer,
                workflow.VariablesSchema,
                cancellationToken));
        }

        return new ProvisionJobRuntimeResult(request.TransportRequestId, summaries);
    }

    public static string BuildProvisioningKey(Guid transportRequestId, string batchKey) =>
        $"{transportRequestId:N}:{batchKey.Trim()}";

    private async Task<ProvisionedJobSummary> ProvisionBatchAsync(
        TransportRequestExecutionSnapshot request,
        JobBatchPlan batch,
        IReadOnlyList<WorkflowTask> orderedTasks,
        IReadOnlyDictionary<Guid, TransportRequestDetailSnapshot> detailsByContainer,
        IReadOnlyList<WorkflowVariableDefinition> variables,
        CancellationToken cancellationToken)
    {
        var provisioningKey = BuildProvisioningKey(request.TransportRequestId, batch.BatchKey);

        var existing = await FindExistingJobAsync(provisioningKey, cancellationToken);
        if (existing is not null)
        {
            EnsureExistingMatchesBatch(existing, batch);
            return ToSummary(existing, batch.BatchKey);
        }

        var useTransaction = db.Database.IsRelational();
        await using var tx = useTransaction
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;

        try
        {
            var job = await CreateJobGraphAsync(
                request,
                batch,
                provisioningKey,
                orderedTasks,
                detailsByContainer,
                variables,
                cancellationToken);

            await db.SaveChangesAsync(cancellationToken);
            if (tx is not null)
            {
                await tx.CommitAsync(cancellationToken);
            }

            return ToSummary(job, batch.BatchKey);
        }
        catch (Exception ex) when (IsProvisioningKeyConflict(ex))
        {
            if (tx is not null)
            {
                await tx.RollbackAsync(cancellationToken);
            }

            db.ChangeTracker.Clear();

            var raced = await FindExistingJobAsync(provisioningKey, cancellationToken)
                ?? throw new ConflictException(
                    $"ProvisioningKey '{provisioningKey}' conflicted but existing Job was not found.",
                    "provisioning_key_conflict");
            EnsureExistingMatchesBatch(raced, batch);
            return ToSummary(raced, batch.BatchKey);
        }
    }

    private async Task<Job?> FindExistingJobAsync(string provisioningKey, CancellationToken cancellationToken) =>
        await db.Jobs
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks)
            .ThenInclude(t => t.JobSteps)
            .AsNoTracking()
            .FirstOrDefaultAsync(j => j.ProvisioningKey == provisioningKey, cancellationToken);

    private static void EnsureExistingMatchesBatch(Job existing, JobBatchPlan batch)
    {
        var existingContainers = existing.JobContainers.Select(c => c.ContainerId).ToHashSet();
        var batchContainers = batch.ContainerIds.ToHashSet();
        if (!existingContainers.SetEquals(batchContainers))
        {
            throw new ConflictException(
                $"Existing Job for ProvisioningKey '{existing.ProvisioningKey}' has a different container set.",
                "provisioning_key_conflict");
        }
    }

    private static bool IsProvisioningKeyConflict(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (current is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg
                && (pg.ConstraintName?.Contains("provisioning_key", StringComparison.OrdinalIgnoreCase) == true
                    || pg.MessageText.Contains("provisioning_key", StringComparison.OrdinalIgnoreCase)))
            {
                return true;
            }

            if (current is DbUpdateException
                && current.InnerException?.Message.Contains("ProvisioningKey", StringComparison.OrdinalIgnoreCase) == true)
            {
                return true;
            }
        }

        return false;
    }

    private async Task<Job> CreateJobGraphAsync(
        TransportRequestExecutionSnapshot request,
        JobBatchPlan batch,
        string provisioningKey,
        IReadOnlyList<WorkflowTask> orderedTasks,
        IReadOnlyDictionary<Guid, TransportRequestDetailSnapshot> detailsByContainer,
        IReadOnlyList<WorkflowVariableDefinition> variables,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var jobId = Guid.NewGuid();
        var jobNo = await codeGenerator.NextJobCodeAsync(cancellationToken: cancellationToken);

        var job = new Job
        {
            Id = jobId,
            JobNo = jobNo,
            WorkflowId = request.WorkflowId,
            MapVersionId = request.MapVersionId,
            ProvisioningKey = provisioningKey,
            Status = JobStatus.CREATED,
            ContextValues = BuildJobContext(request, batch, variables),
            CreatedAt = now,
            QueuedAt = null,
            StartedAt = null,
            CompletedAt = null
        };

        var containerSequence = 0;
        var jobContainersByContainerId = new Dictionary<Guid, JobContainer>();
        foreach (var containerId in batch.ContainerIds)
        {
            var jc = new JobContainer
            {
                Id = Guid.NewGuid(),
                TransportRequestId = request.TransportRequestId,
                JobId = jobId,
                ContainerId = containerId,
                SequenceNo = ++containerSequence,
                Status = JobContainerStatus.PENDING,
                LoadedAt = null,
                DeliveredAt = null,
                CreatedAt = now,
                UpdatedAt = now
            };
            job.JobContainers.Add(jc);
            jobContainersByContainerId[containerId] = jc;
        }

        var jobTaskSequence = 0;
        foreach (var workflowTask in orderedTasks)
        {
            var orderedSteps = workflowTask.Steps.OrderBy(s => s.SequenceNo).ToList();
            var affinity = OperationExecutionScopeCatalog.ResolveTaskAffinity(
                orderedSteps.Select(s => (s.StepType, s.Config.OperationCode)));

            var oncePerJobSteps = orderedSteps
                .Where(s => OperationExecutionScopeCatalog.Get(s.StepType, s.Config.OperationCode).Scope
                            == ExecutionScope.ONCE_PER_JOB)
                .ToList();

            if (oncePerJobSteps.Count > 0)
            {
                var jobTask = NewJobTask(jobId, workflowTask.Id, ++jobTaskSequence, JobTaskContextBuilder.BuildJobScope());
                job.JobTasks.Add(jobTask);
                var stepSeq = 0;
                foreach (var step in oncePerJobSteps)
                {
                    jobTask.JobSteps.Add(NewJobStep(jobTask.Id, step, ++stepSeq));
                }
            }

            var stopScopedSteps = orderedSteps
                .Where(s =>
                {
                    var scope = OperationExecutionScopeCatalog.Get(s.StepType, s.Config.OperationCode);
                    return scope.Scope is ExecutionScope.ONCE_PER_STOP or ExecutionScope.PER_CONTAINER_AT_STOP;
                })
                .ToList();

            if (stopScopedSteps.Count == 0)
            {
                continue;
            }

            foreach (var stop in batch.Stops.OrderBy(s => s.SequenceNo))
            {
                var oncePerStop = stopScopedSteps
                    .Where(s =>
                    {
                        var def = OperationExecutionScopeCatalog.Get(s.StepType, s.Config.OperationCode);
                        if (def.Scope != ExecutionScope.ONCE_PER_STOP)
                        {
                            return false;
                        }

                        var filter = OperationExecutionScopeCatalog.TryResolveStopAction(def, affinity);
                        return filter is null || filter == stop.Action;
                    })
                    .ToList();

                if (oncePerStop.Count > 0)
                {
                    foreach (var step in oncePerStop)
                    {
                        var def = OperationExecutionScopeCatalog.Get(step.StepType, step.Config.OperationCode);
                        if (OperationExecutionScopeCatalog.TryResolveStopAction(def, affinity) is null)
                        {
                            throw new DomainValidationException(
                                $"Step '{step.StepKey}' ({step.StepType}.{step.Config.OperationCode}) requires a resolvable stop action.",
                                "stop_action_unresolved");
                        }
                    }

                    var jobContainerIds = stop.ContainerIds
                        .Select(id => jobContainersByContainerId[id].Id)
                        .ToList();
                    var ctx = JobTaskContextBuilder.BuildStopScope(stop, jobContainerIds);
                    var jobTask = NewJobTask(jobId, workflowTask.Id, ++jobTaskSequence, ctx);
                    job.JobTasks.Add(jobTask);
                    var stepSeq = 0;
                    foreach (var step in oncePerStop)
                    {
                        jobTask.JobSteps.Add(NewJobStep(jobTask.Id, step, ++stepSeq));
                    }
                }

                var perContainer = stopScopedSteps
                    .Where(s =>
                    {
                        var def = OperationExecutionScopeCatalog.Get(s.StepType, s.Config.OperationCode);
                        if (def.Scope != ExecutionScope.PER_CONTAINER_AT_STOP)
                        {
                            return false;
                        }

                        var filter = OperationExecutionScopeCatalog.TryResolveStopAction(def, affinity);
                        return filter is null || filter == stop.Action;
                    })
                    .ToList();

                if (perContainer.Count == 0)
                {
                    continue;
                }

                foreach (var containerId in stop.ContainerIds)
                {
                    var detail = detailsByContainer[containerId];
                    var jc = jobContainersByContainerId[containerId];
                    var ctx = JobTaskContextBuilder.BuildContainerAtStopScope(stop, detail, jc);
                    var jobTask = NewJobTask(jobId, workflowTask.Id, ++jobTaskSequence, ctx);
                    job.JobTasks.Add(jobTask);
                    var stepSeq = 0;
                    foreach (var step in perContainer)
                    {
                        jobTask.JobSteps.Add(NewJobStep(jobTask.Id, step, ++stepSeq));
                    }
                }
            }
        }

        db.Jobs.Add(job);
        return job;
    }

    private static Dictionary<string, JsonElement> BuildJobContext(
        TransportRequestExecutionSnapshot request,
        JobBatchPlan batch,
        IReadOnlyList<WorkflowVariableDefinition> variables)
    {
        var ctx = new Dictionary<string, JsonElement>(StringComparer.Ordinal)
        {
            ["transportRequestId"] = JsonSerializer.SerializeToElement(request.TransportRequestId),
            ["warehouseId"] = JsonSerializer.SerializeToElement(request.WarehouseId),
            ["planSchemaVersion"] = JsonSerializer.SerializeToElement(request.PlanSchemaVersion),
            ["batchKey"] = JsonSerializer.SerializeToElement(batch.BatchKey),
            ["batchSequenceNo"] = JsonSerializer.SerializeToElement(batch.SequenceNo)
        };

        foreach (var variable in variables)
        {
            if (variable.Source == WorkflowVariableSource.ADMIN_INPUT
                && variable.ConfiguredValue is { } configured
                && configured.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
            {
                ctx[variable.Key] = configured;
            }
            else if (variable.Source == WorkflowVariableSource.STAFF_INPUT
                     && request.WorkflowInputs.TryGetValue(variable.Key, out var staff))
            {
                ctx[variable.Key] = staff;
            }
        }

        foreach (var (key, value) in request.WorkflowInputs)
        {
            ctx.TryAdd(key, value);
        }

        return ctx;
    }

    private static JobTask NewJobTask(
        Guid jobId,
        Guid workflowTaskId,
        int sequenceNo,
        Dictionary<string, JsonElement> contextValues) =>
        new()
        {
            Id = Guid.NewGuid(),
            JobId = jobId,
            WorkflowTaskId = workflowTaskId,
            SequenceNo = sequenceNo,
            ContextValues = contextValues,
            Status = JobTaskStatus.PENDING,
            StartedAt = null,
            CompletedAt = null,
            FailureCode = null
        };

    private static JobStep NewJobStep(Guid jobTaskId, WorkflowStep step, int sequenceNo) =>
        new()
        {
            Id = Guid.NewGuid(),
            JobTaskId = jobTaskId,
            WorkflowStepId = step.Id,
            SequenceNo = sequenceNo,
            StepType = step.StepType,
            Status = JobStepStatus.PENDING,
            ResolvedInputs = new Dictionary<string, JsonElement>(),
            OutputValues = new Dictionary<string, JsonElement>(),
            TargetEndpointId = null,
            StartedAt = null,
            CompletedAt = null,
            ErrorCode = null,
            ErrorMessage = null
        };

    private static ProvisionedJobSummary ToSummary(Job job, string batchKey) =>
        new(
            job.Id,
            job.JobNo,
            batchKey,
            job.JobContainers.Count,
            job.JobTasks.Count,
            job.JobTasks.Sum(t => t.JobSteps.Count));
}
