using System.Text.Json;
using Microsoft.EntityFrameworkCore;
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
    string? FailureCode);

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
    IReadOnlyList<JobTaskDto> Tasks);

public sealed record JobContainerDto(
    Guid Id,
    Guid TransportRequestId,
    Guid ContainerId,
    int SequenceNo,
    string Status,
    DateTimeOffset? LoadedAt,
    DateTimeOffset? DeliveredAt);

public sealed record JobTaskDto(
    Guid Id,
    int SequenceNo,
    string TaskKey,
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
    DateTimeOffset? CompletedAt);

/// <summary>Read model for Job APIs (list / detail). JobBatchPlan is never exposed.</summary>
public sealed class JobQueries(WorkflowExecutionDbContext db)
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
                s => new { s.StepKey, s.Name, s.Config.OperationCode, s.WorkflowTask.TaskKey, s.WorkflowTaskId });
        var taskKeys = steps.Values.GroupBy(s => s.WorkflowTaskId).ToDictionary(g => g.Key, g => g.First().TaskKey);

        var orderedSteps = job.JobTasks.OrderBy(t => t.SequenceNo).SelectMany(t => t.JobSteps.OrderBy(s => s.SequenceNo)).ToList();
        var current = orderedSteps.FirstOrDefault(s => s.Status != JobStepStatus.COMPLETED);

        return new JobDetailDto(
            job.Id,
            job.JobNo,
            job.Status.ToString(),
            job.WorkflowId,
            job.MapVersionId,
            AssignedRobot(job),
            job.JobContainers.Select(c => c.TransportRequestId).Distinct().ToList(),
            orderedSteps.Count(s => s.Status == JobStepStatus.COMPLETED),
            orderedSteps.Count,
            job.Status is JobStatus.COMPLETED ? null : current?.Id,
            job.CreatedAt,
            job.StartedAt,
            job.CompletedAt,
            job.FailureCode,
            job.FailureMessage,
            job.JobContainers
                .OrderBy(c => c.SequenceNo)
                .Select(c => new JobContainerDto(c.Id, c.TransportRequestId, c.ContainerId, c.SequenceNo, c.Status.ToString(), c.LoadedAt, c.DeliveredAt))
                .ToList(),
            job.JobTasks
                .OrderBy(t => t.SequenceNo)
                .Select(t => new JobTaskDto(
                    t.Id,
                    t.SequenceNo,
                    taskKeys.GetValueOrDefault(t.WorkflowTaskId, ""),
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
                                s.ErrorCode, s.ErrorMessage, s.StartedAt, s.CompletedAt);
                        })
                        .ToList()))
                .ToList());
    }

    public async Task<(IReadOnlyList<JobSummaryDto> Items, int Total)> ListAsync(
        JobStatus? status,
        Guid? transportRequestId,
        int take,
        CancellationToken cancellationToken)
    {
        var query = db.Jobs.AsNoTracking().AsQueryable();
        if (status is { } s)
        {
            query = query.Where(j => j.Status == s);
        }

        if (transportRequestId is { } requestId)
        {
            query = query.Where(j => j.JobContainers.Any(c => c.TransportRequestId == requestId));
        }

        var total = await query.CountAsync(cancellationToken);
        var jobs = await query
            .OrderByDescending(j => j.CreatedAt)
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
                all.Count(x => x.Status == JobStepStatus.COMPLETED),
                all.Count,
                j.CreatedAt, j.StartedAt, j.CompletedAt, j.FailureCode);
        }).ToList();

        return (items, total);
    }

    private static Guid? AssignedRobot(Job job) => Id(job.ContextValues, JobExecutionEngine.AssignedRobotKey);

    private static string? Text(IReadOnlyDictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static Guid? Id(IReadOnlyDictionary<string, JsonElement> values, string key) =>
        values.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String && v.TryGetGuid(out var id) ? id : null;
}
