using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Reporting;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;

namespace WaroTrans.WorkflowExecution.Features.JobReport;

/// <param name="CountedInSummary">
/// True when the Job is in the summary's completed / failed numbers: it finished as COMPLETED or FAILED inside the
/// period. A cancelled Job, or one that only started in the period, is listed but not counted.
/// </param>
public sealed record JobReportRow(
    Guid Id,
    string JobNo,
    string Status,
    string WorkflowCode,
    string WorkflowName,
    int Priority,
    int Containers,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    string? FailureCode,
    bool CreatedInPeriod,
    bool FinishedInPeriod,
    bool CountedInSummary);

/// <summary>FE-20 detail export: every Job created or finished inside the period, oldest first.</summary>
public sealed class JobReportReader(WorkflowExecutionDbContext db)
{
    public async Task<IReadOnlyList<JobReportRow>> ReadAsync(StatisticsRange range, CancellationToken cancellationToken)
    {
        var rows = await db.Jobs.AsNoTracking()
            .Where(j => (j.CreatedAt >= range.From && j.CreatedAt < range.To)
                        || (j.CompletedAt != null && j.CompletedAt >= range.From && j.CompletedAt < range.To))
            .OrderBy(j => j.CreatedAt)
            .ThenBy(j => j.JobNo)
            .Take(ReportLimits.MaxRows + 1)
            .Select(j => new
            {
                j.Id,
                j.JobNo,
                j.Status,
                j.WorkflowId,
                j.Priority,
                Containers = j.JobContainers.Count,
                j.CreatedAt,
                j.StartedAt,
                j.CompletedAt,
                j.FailureCode
            })
            .ToListAsync(cancellationToken);
        if (rows.Count > ReportLimits.MaxRows) throw ReportLimits.TooLarge("jobs");

        var workflowIds = rows.Select(r => r.WorkflowId).Distinct().ToList();
        var workflows = await db.Workflows.AsNoTracking()
            .Where(w => workflowIds.Contains(w.Id))
            .Select(w => new { w.Id, w.Code, w.Name })
            .ToDictionaryAsync(w => w.Id, cancellationToken);

        return rows.Select(j =>
            {
                var finished = j.CompletedAt is { } at && range.Contains(at);
                var meta = workflows.GetValueOrDefault(j.WorkflowId);
                return new JobReportRow(
                    j.Id,
                    j.JobNo,
                    j.Status.ToString(),
                    meta?.Code ?? "UNKNOWN",
                    meta?.Name ?? "Deleted workflow",
                    j.Priority,
                    j.Containers,
                    j.CreatedAt,
                    j.StartedAt,
                    j.CompletedAt,
                    j.FailureCode,
                    range.Contains(j.CreatedAt),
                    finished,
                    finished && j.Status is JobStatus.COMPLETED or JobStatus.FAILED);
            })
            .ToList();
    }
}
