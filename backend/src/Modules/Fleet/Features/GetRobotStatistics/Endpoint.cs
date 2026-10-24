using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Statistics;

namespace WaroTrans.Fleet.Features.GetRobotStatistics;

public static class GetRobotStatisticsEndpoint
{
    public static RouteGroupBuilder MapGetRobotStatistics(this RouteGroupBuilder group)
    {
        group.MapGet("/statistics/robots", async (
            DateTimeOffset? from,
            DateTimeOffset? to,
            int? utcOffsetMinutes,
            GetRobotStatisticsHandler handler,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, clock.GetUtcNow());
            return Results.Ok(await handler.HandleAsync(range, cancellationToken));
        })
        .RequireAuthorization(AuthorizationPolicies.AdminOnly)
        .WithName("GetRobotStatistics")
        .WithSummary("Fleet statistics for the admin dashboard")
        .WithDescription(
            "Robots right now (by status, online, battery) and how the assignments that ended in [from, to) " +
            "(default: the last 7 days) ended, in total and per robot.");

        return group;
    }
}
