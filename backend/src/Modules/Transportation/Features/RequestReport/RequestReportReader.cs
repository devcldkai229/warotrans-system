using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Reporting;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Persistence;

namespace WaroTrans.Transportation.Features.RequestReport;

/// <param name="SubmittedInPeriod">Counted in the summary's submitted number and status breakdown.</param>
/// <param name="CountedInLeadTime">Completed inside the period, so it is in the summary's average lead time.</param>
public sealed record RequestReportRow(
    Guid Id,
    string RequestCode,
    string Status,
    int Priority,
    int Containers,
    DateTimeOffset SubmittedAt,
    DateTimeOffset? CompletedAt,
    string? FailureCode,
    bool SubmittedInPeriod,
    bool CountedInLeadTime);

/// <summary>FE-20 detail export: every transport request submitted or completed inside the period, oldest first.</summary>
public sealed class RequestReportReader(TransportationDbContext db)
{
    public async Task<IReadOnlyList<RequestReportRow>> ReadAsync(StatisticsRange range, CancellationToken cancellationToken)
    {
        var rows = await db.TransportRequests.AsNoTracking()
            .Where(r => (r.SubmittedAt >= range.From && r.SubmittedAt < range.To)
                        || (r.CompletedAt != null && r.CompletedAt >= range.From && r.CompletedAt < range.To))
            .OrderBy(r => r.SubmittedAt)
            .ThenBy(r => r.RequestCode)
            .Take(ReportLimits.MaxRows + 1)
            .Select(r => new
            {
                r.Id,
                r.RequestCode,
                r.Status,
                r.Priority,
                Containers = r.Details.Count,
                r.SubmittedAt,
                r.CompletedAt,
                r.FailureCode
            })
            .ToListAsync(cancellationToken);
        if (rows.Count > ReportLimits.MaxRows) throw ReportLimits.TooLarge("requests");

        return rows.Select(r => new RequestReportRow(
                r.Id,
                r.RequestCode,
                r.Status.ToString(),
                r.Priority,
                r.Containers,
                r.SubmittedAt,
                r.CompletedAt,
                r.FailureCode,
                range.Contains(r.SubmittedAt),
                r.Status == TransportRequestStatus.COMPLETED && r.CompletedAt is { } at && range.Contains(at)))
            .ToList();
    }
}
