using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.GetJobStatistics;

public sealed class GetJobStatisticsHandler(WorkflowExecutionDbContext db)
{
    // Lifecycle order, so the dashboard lists them the way a job moves through them.
    private static readonly JobStatus[] ActiveStatuses =
    [
        JobStatus.CREATED,
        JobStatus.QUEUED,
        JobStatus.ASSIGNED,
        JobStatus.RUNNING,
        JobStatus.PAUSED,
        JobStatus.REASSIGNING,
        JobStatus.RECOVERY_REQUIRED
    ];

    private const int TopFailureCodeLimit = 5;

    private sealed record Finished(
        Guid WorkflowId,
        JobStatus Status,
        DateTimeOffset? StartedAt,
        DateTimeOffset CompletedAt,
        string? FailureCode);

    public async Task<JobStatisticsResponse> HandleAsync(StatisticsRange range, CancellationToken cancellationToken)
    {
        // A job finishes as COMPLETED or FAILED and gets CompletedAt then. This window plus the one before it (for the
        // "vs previous period" delta) is a small slice, so it is aggregated here instead of in SQL.
        var finishedRows = await db.Jobs
            .AsNoTracking()
            .Where(j => (j.Status == JobStatus.COMPLETED || j.Status == JobStatus.FAILED)
                        && j.CompletedAt != null
                        && j.CompletedAt >= range.PreviousFrom
                        && j.CompletedAt < range.To)
            .Select(j => new Finished(j.WorkflowId, j.Status, j.StartedAt, j.CompletedAt!.Value, j.FailureCode))
            .ToListAsync(cancellationToken);

        var finished = finishedRows.Where(j => range.Contains(j.CompletedAt)).ToList();
        var completed = finished.Where(j => j.Status == JobStatus.COMPLETED).ToList();
        var failed = finished.Where(j => j.Status == JobStatus.FAILED).ToList();
        var previousCompleted = finishedRows.Count(j => j.Status == JobStatus.COMPLETED && range.ContainsPrevious(j.CompletedAt));

        var created = await db.Jobs.AsNoTracking()
            .CountAsync(j => j.CreatedAt >= range.From && j.CreatedAt < range.To, cancellationToken);

        // A job is created CREATED and waits until somebody runs it on a robot; QueuedAt is only set at that same
        // moment, so the wait is measured from creation.
        var startDelays = await db.Jobs.AsNoTracking()
            .Where(j => j.StartedAt != null && j.StartedAt >= range.From && j.StartedAt < range.To)
            .Select(j => new { j.CreatedAt, StartedAt = j.StartedAt!.Value })
            .ToListAsync(cancellationToken);

        var activeCounts = await db.Jobs.AsNoTracking()
            .Where(j => ActiveStatuses.Contains(j.Status))
            .GroupBy(j => j.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var active = ActiveStatuses
            .Select(status => new JobStatusCount(
                status.ToString(),
                activeCounts.FirstOrDefault(c => c.Status == status)?.Count ?? 0))
            .ToList();

        var workflowIds = finished.Select(j => j.WorkflowId).Distinct().ToList();
        var workflows = await db.Workflows.AsNoTracking()
            .Where(w => workflowIds.Contains(w.Id))
            .Select(w => new { w.Id, w.Code, w.Name })
            .ToDictionaryAsync(w => w.Id, cancellationToken);

        var byWorkflow = finished
            .GroupBy(j => j.WorkflowId)
            .Select(g =>
            {
                var meta = workflows.GetValueOrDefault(g.Key);
                return new WorkflowJobStatistics(
                    g.Key,
                    meta?.Code ?? "UNKNOWN",
                    meta?.Name ?? "Deleted workflow",
                    g.Count(j => j.Status == JobStatus.COMPLETED),
                    g.Count(j => j.Status == JobStatus.FAILED),
                    AverageSeconds(g.Where(j => j.Status == JobStatus.COMPLETED)));
            })
            .OrderByDescending(w => w.Completed + w.Failed)
            .ThenBy(w => w.WorkflowCode, StringComparer.Ordinal)
            .ToList();

        var daily = range.LocalDays()
            .Select(day => new DailyJobStatistics(
                day,
                completed.Count(j => range.LocalDate(j.CompletedAt) == day),
                failed.Count(j => range.LocalDate(j.CompletedAt) == day)))
            .ToList();

        var topFailureCodes = failed
            .GroupBy(j => string.IsNullOrWhiteSpace(j.FailureCode) ? "UNKNOWN" : j.FailureCode!)
            .Select(g => new FailureCodeCount(g.Key, g.Count()))
            .OrderByDescending(c => c.Count)
            .ThenBy(c => c.Code, StringComparer.Ordinal)
            .Take(TopFailureCodeLimit)
            .ToList();

        return new JobStatisticsResponse(
            range.From,
            range.To,
            created,
            completed.Count,
            failed.Count,
            previousCompleted,
            AverageSeconds(completed),
            startDelays.Count == 0 ? null : startDelays.Average(j => Math.Max(0, (j.StartedAt - j.CreatedAt).TotalSeconds)),
            active,
            byWorkflow,
            daily,
            topFailureCodes);
    }

    private static double? AverageSeconds(IEnumerable<Finished> jobs)
    {
        var durations = jobs
            .Where(j => j.StartedAt is not null)
            .Select(j => Math.Max(0, (j.CompletedAt - j.StartedAt!.Value).TotalSeconds))
            .ToList();
        return durations.Count == 0 ? null : durations.Average();
    }
}
