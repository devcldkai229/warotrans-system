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

    public async Task<IReadOnlyList<JobEvidenceContext>> GetJobsOfRequestAsync(
        Guid transportRequestId, CancellationToken cancellationToken = default)
    {
        var jobIds = db.JobContainers.Where(c => c.TransportRequestId == transportRequestId).Select(c => c.JobId);
        return await LoadAsync(db.Jobs.Where(j => jobIds.Contains(j.Id)), cancellationToken);
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
