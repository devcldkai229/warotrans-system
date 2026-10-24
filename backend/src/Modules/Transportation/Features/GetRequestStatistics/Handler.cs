using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Persistence;

namespace WaroTrans.Transportation.Features.GetRequestStatistics;

public sealed class GetRequestStatisticsHandler(TransportationDbContext db)
{
    private static readonly TransportRequestStatus[] OpenStatuses =
    [
        TransportRequestStatus.SUBMITTED,
        TransportRequestStatus.QUEUED,
        TransportRequestStatus.IN_PROGRESS
    ];

    public async Task<RequestStatisticsResponse> HandleAsync(StatisticsRange range, CancellationToken cancellationToken)
    {
        var submittedRows = await db.TransportRequests.AsNoTracking()
            .Where(r => r.SubmittedAt >= range.PreviousFrom && r.SubmittedAt < range.To)
            .Select(r => new { r.Status, r.SubmittedAt })
            .ToListAsync(cancellationToken);
        var submitted = submittedRows.Where(r => range.Contains(r.SubmittedAt)).ToList();

        var completed = await db.TransportRequests.AsNoTracking()
            .Where(r => r.Status == TransportRequestStatus.COMPLETED
                        && r.CompletedAt != null
                        && r.CompletedAt >= range.From
                        && r.CompletedAt < range.To)
            .Select(r => new { r.SubmittedAt, CompletedAt = r.CompletedAt!.Value })
            .ToListAsync(cancellationToken);

        var open = await db.TransportRequests.AsNoTracking()
            .CountAsync(r => OpenStatuses.Contains(r.Status), cancellationToken);

        return new RequestStatisticsResponse(
            range.From,
            range.To,
            submitted.Count,
            submittedRows.Count(r => range.ContainsPrevious(r.SubmittedAt)),
            open,
            completed.Count == 0
                ? null
                : completed.Average(r => Math.Max(0, (r.CompletedAt - r.SubmittedAt).TotalSeconds)),
            Enum.GetValues<TransportRequestStatus>()
                .Select(status => new RequestStatusCount(status.ToString(), submitted.Count(r => r.Status == status)))
                .ToList(),
            range.LocalDays()
                .Select(day => new DailyRequestStatistics(
                    day,
                    submitted.Count(r => range.LocalDate(r.SubmittedAt) == day),
                    completed.Count(r => range.LocalDate(r.CompletedAt) == day)))
                .ToList());
    }
}
