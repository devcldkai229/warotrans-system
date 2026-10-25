using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Statistics;

namespace WaroTrans.Transportation.Features.GetRequestStatistics;

public static class GetRequestStatisticsEndpoint
{
    public static RouteGroupBuilder MapGetRequestStatistics(this RouteGroupBuilder group)
    {
        group.MapGet("/statistics/requests", async (
            DateTimeOffset? from,
            DateTimeOffset? to,
            int? utcOffsetMinutes,
            GetRequestStatisticsHandler handler,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, clock.GetUtcNow());
            return Results.Ok(await handler.HandleAsync(range, cancellationToken));
        })
        .RequireAuthorization(AuthorizationPolicies.AdminOnly)
        .WithName("GetRequestStatistics")
        .WithSummary("Transport request statistics for the admin dashboard")
        .WithDescription(
            "Requests submitted in [from, to) (default: the last 7 days) by status and per day, the lead time of " +
            "requests that completed in it, and how many requests are still open right now.");

        return group;
    }
}
