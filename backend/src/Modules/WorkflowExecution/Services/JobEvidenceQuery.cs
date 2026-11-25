using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Services;

internal sealed class JobEvidenceQuery(WorkflowExecutionDbContext db) : IJobEvidenceQuery
{
    public async Task<JobEvidenceContext?> GetJobAsync(Guid jobId, CancellationToken cancellationToken = default) =>
        (await LoadAsync(db.Jobs.Where(j => j.Id == jobId), cancellationToken)).FirstOrDefault();

    public async Task<Guid?> GetJobIdOfStepAsync(Guid jobStepId, CancellationToken cancellationToken = default) =>
        await db.JobSteps.AsNoTracking()
            .Where(s => s.Id == jobStepId)
            .Select(s => (Guid?)s.JobTask.JobId)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<JobStepEvidenceView?> GetStepAsync(Guid jobStepId, CancellationToken cancellationToken = default)
    {
        var jobId = await GetJobIdOfStepAsync(jobStepId, cancellationToken);
        if (jobId is null)
        {
            return null;
        }

        var steps = await (
                from step in db.JobSteps.AsNoTracking()
                join task in db.JobTasks.AsNoTracking() on step.JobTaskId equals task.Id
                join definition in db.WorkflowSteps.AsNoTracking() on step.WorkflowStepId equals definition.Id
                join taskDefinition in db.WorkflowTasks.AsNoTracking() on task.WorkflowTaskId equals taskDefinition.Id
                where task.JobId == jobId
                orderby task.SequenceNo, step.SequenceNo
                select new
                {
                    step.Id,
                    step.StepType,
                    definition.Name,
                    TaskName = taskDefinition.Name,
                    step.TargetEndpointId,
                    step.ResolvedInputs,
                    definition.Config
                })
            .ToListAsync(cancellationToken);
        var index = steps.FindIndex(s => s.Id == jobStepId);
        if (index < 0)
        {
            return null;
        }

        var found = steps[index];
        var purpose = found.ResolvedInputs.TryGetValue("purpose", out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
        var operation = string.IsNullOrWhiteSpace(found.Config?.OperationCode) ? null : found.Config.OperationCode;
        return new JobStepEvidenceView(found.Id, found.StepType.ToString(), found.Name, found.TaskName, index + 1, steps.Count,
            found.TargetEndpointId, purpose, operation);
    }

    public async Task<IReadOnlyList<JobEvidenceContext>> GetJobsOfRequestAsync(
        Guid transportRequestId, CancellationToken cancellationToken = default)
    {
        var jobIds = db.JobContainers.Where(c => c.TransportRequestId == transportRequestId).Select(c => c.JobId);
        return await LoadAsync(db.Jobs.Where(j => jobIds.Contains(j.Id)), cancellationToken);
    }

    public async Task<IReadOnlyList<JobEvidenceContext>> GetUnfinishedJobsAsync(CancellationToken cancellationToken = default)
    {
        var finished = new[] { Enums.JobStatus.COMPLETED, Enums.JobStatus.FAILED, Enums.JobStatus.CANCELLED, Enums.JobStatus.CREATED };
        var withRequest = db.JobContainers.Where(c => c.TransportRequestId != null).Select(c => c.JobId);
        return await LoadAsync(db.Jobs.Where(j => !finished.Contains(j.Status) && withRequest.Contains(j.Id)), cancellationToken);
    }

    private async Task<IReadOnlyList<JobEvidenceContext>> LoadAsync(
        IQueryable<Entities.Job> jobs, CancellationToken cancellationToken)
    {
        var rows = await jobs.AsNoTracking()
            .Include(j => j.JobContainers)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        if (rows.Count == 0)
        {
            return [];
        }

        var ids = rows.Select(j => j.Id).ToList();
        var assignments = (await db.JobRobotAssignments.AsNoTracking()
                .Where(a => ids.Contains(a.JobId))
                .OrderBy(a => a.StartedAt)
                .ToListAsync(cancellationToken))
            .GroupBy(a => a.JobId)
            .ToDictionary(g => g.Key, g => g.ToList());

        return rows
            .OrderBy(j => j.CreatedAt)
            .Select(j => new JobEvidenceContext(
                j.Id,
                j.JobNo,
                j.Status.ToString(),
                j.MapVersionId,
                RequestOf(j),
                j.JobContainers.OrderBy(c => c.SequenceNo).Select(c => c.ContainerId).ToList(),
                (assignments.GetValueOrDefault(j.Id) ?? [])
                    .Select(a => new JobRobotAssignmentView(a.Id, a.RobotId, a.StartReason, a.StartedAt, a.EndedAt, a.EndReason))
                    .ToList()))
            .ToList();
    }

    private static Guid? RequestOf(Entities.Job job) =>
        job.JobContainers.Select(c => (Guid?)c.TransportRequestId).FirstOrDefault()
        ?? (job.ContextValues.TryGetValue("transportRequestId", out var value)
            && value.ValueKind == JsonValueKind.String && value.TryGetGuid(out var id)
                ? id
                : null);
}
