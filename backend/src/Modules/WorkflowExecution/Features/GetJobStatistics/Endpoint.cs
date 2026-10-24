using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Statistics;

namespace WaroTrans.WorkflowExecution.Features.GetJobStatistics;

public static class GetJobStatisticsEndpoint
{
    public static RouteGroupBuilder MapGetJobStatistics(this RouteGroupBuilder group)
    {
        group.MapGet("/statistics/jobs", async (
            DateTimeOffset? from,
            DateTimeOffset? to,
            int? utcOffsetMinutes,
            GetJobStatisticsHandler handler,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, clock.GetUtcNow());
            return Results.Ok(await handler.HandleAsync(range, cancellationToken));
        })
        .RequireAuthorization(AuthorizationPolicies.AdminOnly)
        .WithName("GetJobStatistics")
        .WithSummary("Job statistics for the admin dashboard")
        .WithDescription(
            "Jobs that finished in [from, to) (default: the last 7 days): completed, failed, durations, per workflow, " +
            "per day and the most common failure codes, plus how many jobs are in each active status right now.");

        return group;
    }
}
