using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Execution;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.Shared;

public sealed record JobSummaryDto(
    Guid Id,
    string JobNo,
    string Status,
    Guid WorkflowId,
    Guid MapVersionId,
    Guid? AssignedRobotId,
    IReadOnlyList<Guid> TransportRequestIds,
    int ContainerCount,
    int CompletedSteps,
    int TotalSteps,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    string? FailureCode,
    string? WorkflowName = null,
    string? RobotCode = null,
    IReadOnlyList<string>? RequestCodes = null,
    IReadOnlyList<string>? ContainerBarcodes = null,
    int? TripNo = null,
    int? TripCount = null,
    string? BlockingReason = null,
    IReadOnlyList<JobTripStopDto>? Stops = null,
    IReadOnlyList<JobTripContainerDto>? Containers = null);

/// <summary>One stop of a trip (a Job): where the robot collects or delivers, and how many Containers.</summary>
public sealed record JobTripStopDto(int SequenceNo, string Action, Guid EndpointId, int ContainerCount, string? EndpointCode = null);

/// <summary>One Container of a trip and where it is in it (PENDING, ASSIGNED, ONBOARD, DELIVERED, FAILED, CANCELLED).</summary>
public sealed record JobTripContainerDto(Guid ContainerId, int SequenceNo, string Status, string? Barcode = null);

public sealed record JobDetailDto(
    Guid Id,
    string JobNo,
    string Status,
    Guid WorkflowId,
    Guid MapVersionId,
    Guid? AssignedRobotId,
    IReadOnlyList<Guid> TransportRequestIds,
    int CompletedSteps,
    int TotalSteps,
    Guid? CurrentStepId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    string? FailureCode,
    string? FailureMessage,
    IReadOnlyList<JobContainerDto> Containers,
    IReadOnlyList<JobTaskDto> Tasks,
    // BOTH-04: what this caller may do to the Job now, decided by the same rule the endpoints enforce.
    IReadOnlyList<ActionAvailability> AvailableActions,
    int Priority = 0,
    DateTimeOffset? DeadlineAt = null,
    DateTimeOffset? QueuedAt = null,
    string? BlockingReason = null);

public sealed record JobContainerDto(
    Guid Id,
    Guid TransportRequestId,
    Guid ContainerId,
    int SequenceNo,
    string Status,
    DateTimeOffset? LoadedAt,
    DateTimeOffset? DeliveredAt,
    string? FailureCode,
    string? FailureMessage,
    DateTimeOffset? FailedAt);

/// <summary>
/// One execution segment of the Job. A Workflow Task can become several of these (checks once per Job, a stop once per
/// stop, a hand-over once per Container), so segments that share a <c>TaskKey</c> belong to the same Workflow Task, whose
/// <c>TaskName</c> is what the workflow calls it.
/// </summary>
public sealed record JobTaskDto(
    Guid Id,
    int SequenceNo,
    string TaskKey,
    string TaskName,
    string Status,
    string? ExecutionScope,
    string? StopAction,
    Guid? StopEndpointId,
    Guid? ContainerId,
    IReadOnlyList<JobStepDto> Steps);

public sealed record JobStepDto(
    Guid Id,
    int SequenceNo,
    string StepKey,
    string Name,
    string StepType,
    string OperationCode,
    string Status,
    Guid? TargetEndpointId,
    IReadOnlyDictionary<string, JsonElement> ResolvedInputs,
    IReadOnlyDictionary<string, JsonElement> OutputValues,
    string? ErrorCode,
    string? ErrorMessage,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    Guid? ClaimedBy = null,
    string? ClaimedByName = null,
    DateTimeOffset? ClaimExpiresAt = null,
    DateTimeOffset? DeadlineAt = null,
    DateTimeOffset? EscalatedAt = null);

/// <summary>Read model for Job APIs (list / detail). JobBatchPlan is never exposed.</summary>
public sealed class JobQueries(WorkflowExecutionDbContext db, ICurrentUser currentUser, IAccountNameLookup? accountNames = null)
{
    public async Task<JobDetailDto> GetDetailAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var job = await db.Jobs.AsNoTracking()
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .AsSplitQuery()
            .FirstOrDefaultAsync(j => j.Id == jobId, cancellationToken)
            ?? throw new NotFoundException($"Job '{jobId}' was not found.", "job_not_found");

        // Config is a JSON column: load the template steps and map in memory.
        var steps = (await db.WorkflowSteps.AsNoTracking()
                .Include(s => s.WorkflowTask)
                .Where(s => s.WorkflowTask.WorkflowId == job.WorkflowId)
                .ToListAsync(cancellationToken))
            .ToDictionary(
                s => s.Id,
                s => new { s.StepKey, s.Name, s.Config.OperationCode, s.WorkflowTask.TaskKey, TaskName = s.WorkflowTask.Name, s.WorkflowTaskId });
        var taskKeys = steps.Values.GroupBy(s => s.WorkflowTaskId).ToDictionary(g => g.Key, g => g.First().TaskKey);
        var taskNames = steps.Values.GroupBy(s => s.WorkflowTaskId).ToDictionary(g => g.Key, g => g.First().TaskName);

        var orderedSteps = job.JobTasks.OrderBy(t => t.SequenceNo).SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo)).ToList();
        var current = orderedSteps.FirstOrDefault(s => s.Status is not (JobStepStatus.COMPLETED or JobStepStatus.SKIPPED));
        var now = DateTimeOffset.UtcNow;
        var holders = orderedSteps.Where(s => s.ClaimExpiresAt > now).Select(s => s.ClaimedBy).OfType<Guid>().Distinct().ToList();
        var claimants = holders.Count == 0 || accountNames is null
            ? new Dictionary<Guid, string>()
            : new Dictionary<Guid, string>(await accountNames.GetNamesAsync(holders, cancellationToken));

        return new JobDetailDto(
            job.Id,
            job.JobNo,
            job.Status.ToString(),
            job.WorkflowId,
            job.MapVersionId,
            AssignedRobot(job),
            job.JobContainers.Select(c => c.TransportRequestId).Distinct().ToList(),
            orderedSteps.Count(s => s.Status is JobStepStatus.COMPLETED or JobStepStatus.SKIPPED),
            orderedSteps.Count,
            job.Status is JobStatus.COMPLETED ? null : current?.Id,
            job.CreatedAt,
            job.StartedAt,
            job.CompletedAt,
            job.FailureCode,
            job.FailureMessage,
            job.JobContainers
                .OrderBy(c => c.SequenceNo)
                .Select(c => new JobContainerDto(c.Id, c.TransportRequestId, c.ContainerId, c.SequenceNo, c.Status.ToString(), c.LoadedAt, c.DeliveredAt, c.FailureCode, c.FailureMessage, c.FailedAt))
                .ToList(),
            job.JobTasks
                .OrderBy(t => t.SequenceNo)
                .Select(t => new JobTaskDto(
                    t.Id,
                    t.SequenceNo,
                    taskKeys.GetValueOrDefault(t.WorkflowTaskId, ""),
                    taskNames.GetValueOrDefault(t.WorkflowTaskId, ""),
                    t.Status.ToString(),
                    Text(t.ContextValues, "executionScope"),
                    Text(t.ContextValues, "stopAction"),
                    Id(t.ContextValues, "stopEndpointId"),
                    Id(t.ContextValues, "containerId"),
                    t.JobSteps
                        .OrderBy(s => s.SequenceNo)
                        .Select(s =>
                        {
                            var w = steps[s.WorkflowStepId];
                            return new JobStepDto(
                                s.Id, s.SequenceNo, w.StepKey, w.Name, s.StepType.ToString(), w.OperationCode,
                                s.Status.ToString(), s.TargetEndpointId, s.ResolvedInputs, s.OutputValues,
                                s.ErrorCode, s.ErrorMessage, s.StartedAt, s.CompletedAt,
                                // A claim that ran out is nobody's: the scan clears it within seconds, the read does not wait.
                                s.ClaimExpiresAt > now ? s.ClaimedBy : null,
                                s.ClaimExpiresAt > now && s.ClaimedBy is { } holder ? claimants.GetValueOrDefault(holder) : null,
                                s.ClaimExpiresAt > now ? s.ClaimExpiresAt : null,
                                s.DeadlineAt,
                                s.EscalatedAt);
                        })
                        .ToList()))
                .ToList(),
            JobActionPolicy.Evaluate(job.Status, currentUser.Can),
            job.Priority,
            job.DeadlineAt,
            job.QueuedAt,
            job.BlockingReason);
    }

    public async Task<(IReadOnlyList<JobSummaryDto> Items, int Total)> ListAsync(
        JobStatus? status,
        Guid? transportRequestId,
        int take,
        CancellationToken cancellationToken,
        IReadOnlyCollection<Guid>? jobIds = null,
        string? search = null,
        int skip = 0)
    {
        var query = db.Jobs.AsNoTracking().AsQueryable();
        if (jobIds is not null)
        {
            query = query.Where(j => jobIds.Contains(j.Id));
        }

        if (status is { } s)
        {
            query = query.Where(j => j.Status == s);
        }

        if (transportRequestId is { } requestId)
        {
            query = query.Where(j => j.JobContainers.Any(c => c.TransportRequestId == requestId));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            // Pasting a Job's id finds it as well as typing part of its number.
            if (Guid.TryParse(term, out var jobId))
            {
                query = query.Where(j => j.Id == jobId || EF.Functions.ILike(j.JobNo, $"%{term}%"));
            }
            else
            {
                query = query.Where(j => EF.Functions.ILike(j.JobNo, $"%{term}%"));
            }
        }

        var total = await query.CountAsync(cancellationToken);
        var jobs = await query
            .OrderByDescending(j => j.CreatedAt)
            .ThenByDescending(j => j.Id)
            .Skip(skip)
            .Take(take)
            .Include(j => j.JobContainers)
            .Include(j => j.JobTasks).ThenInclude(t => t.JobSteps)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);

        var items = jobs.Select(j =>
        {
            var all = j.JobTasks.SelectMany(t => t.JobSteps).ToList();
            return new JobSummaryDto(
                j.Id, j.JobNo, j.Status.ToString(), j.WorkflowId, j.MapVersionId, AssignedRobot(j),
                j.JobContainers.Select(c => c.TransportRequestId).Distinct().ToList(),
                j.JobContainers.Count,
                all.Count(x => x.Status is JobStepStatus.COMPLETED or JobStepStatus.SKIPPED),
                all.Count,
                j.CreatedAt, j.StartedAt, j.CompletedAt, j.FailureCode)
            {
                TripNo = Number(j.ContextValues, "batchSequenceNo"),
                BlockingReason = j.BlockingReason,
                Stops = TripStops(j),
                Containers = j.JobContainers
                    .OrderBy(c => c.SequenceNo)
                    .Select(c => new JobTripContainerDto(c.ContainerId, c.SequenceNo, c.Status.ToString()))
                    .ToList()
            };
        }).ToList();

        return (items, total);
    }

    private static Guid? AssignedRobot(Job job) => Id(job.ContextValues, JobExecutionEngine.AssignedRobotKey);

    private static int? Number(IReadOnlyDictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : null;

    /// <summary>The stops of a trip, from its once-per-stop tasks (provisioning writes stopSequenceNo/EndpointId/Action).</summary>
    private static List<JobTripStopDto> TripStops(Job job) =>
        job.JobTasks
            .Select(t => t.ContextValues)
            .Where(c => Number(c, "stopSequenceNo") is not null && Id(c, "stopEndpointId") is not null && Text(c, "stopAction") is not null)
            .Select(c => new JobTripStopDto(
                Number(c, "stopSequenceNo")!.Value,
                Text(c, "stopAction")!,
                Id(c, "stopEndpointId")!.Value,
                c.TryGetValue("containerIds", out var ids) && ids.ValueKind == JsonValueKind.Array ? ids.GetArrayLength() : 0))
            .GroupBy(s => s.SequenceNo)
            // Per-container tasks at a stop carry the stop too; the stop task lists all its Containers.
            .Select(g => g.MaxBy(s => s.ContainerCount)!)
            .OrderBy(s => s.SequenceNo)
            .ToList();

    private static string? Text(IReadOnlyDictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static Guid? Id(IReadOnlyDictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String && v.TryGetGuid(out var id) ? id : null;
}
