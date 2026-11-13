using WaroTrans.BuildingBlocks.Statistics;
using WaroTrans.Fleet.Features.GetRobotStatistics;
using WaroTrans.Fleet.Features.RobotAvailability;
using WaroTrans.Transportation.Features.GetRequestStatistics;
using WaroTrans.WorkflowExecution.Features.GetJobStatistics;

namespace WaroTrans.Host.Reporting;

/// <summary>
/// FE-20: one period's report. The three statistics parts are exactly what the dashboard endpoints return for the same
/// window (they come from the same handlers), so a printed or exported report never disagrees with the screen.
/// </summary>
public sealed record PeriodReport(
    DateTimeOffset From,
    DateTimeOffset To,
    int UtcOffsetMinutes,
    DateTimeOffset GeneratedAt,
    JobStatisticsResponse Jobs,
    RequestStatisticsResponse Requests,
    RobotStatisticsResponse Robots,
    RobotAvailabilityResponse Availability);

public sealed class PeriodReportBuilder(
    GetJobStatisticsHandler jobs,
    GetRequestStatisticsHandler requests,
    GetRobotStatisticsHandler robots,
    GetRobotAvailabilityHandler availability)
{
    public async Task<PeriodReport> BuildAsync(StatisticsRange range, DateTimeOffset now, CancellationToken cancellationToken) =>
        new(
            range.From,
            range.To,
            range.UtcOffsetMinutes,
            now,
            await jobs.HandleAsync(range, cancellationToken),
            await requests.HandleAsync(range, cancellationToken),
            await robots.HandleAsync(range, cancellationToken),
            await availability.HandleAsync(range, now, cancellationToken));
}
