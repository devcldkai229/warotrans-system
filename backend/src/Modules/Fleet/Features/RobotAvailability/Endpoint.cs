using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Statistics;

namespace WaroTrans.Fleet.Features.RobotAvailability;

public static class GetRobotAvailabilityEndpoint
{
    public static RouteGroupBuilder MapGetRobotAvailability(this RouteGroupBuilder group)
    {
        group.MapGet("/statistics/availability", async (
            DateTimeOffset? from,
            DateTimeOffset? to,
            int? utcOffsetMinutes,
            GetRobotAvailabilityHandler handler,
            TimeProvider clock,
            CancellationToken cancellationToken) =>
        {
            var now = clock.GetUtcNow();
            var range = StatisticsRange.Resolve(from, to, utcOffsetMinutes, now);
            return Results.Ok(await handler.HandleAsync(range, now, cancellationToken));
        })
        .RequirePermission(Permissions.StatisticsRead)
        .WithName("GetRobotAvailability")
        .WithSummary("How much of the window each robot was online and able to take work")
        .WithDescription(
            "Replays the robots' state history over [from, to) (default: the last 7 days): time online, available, " +
            "busy and in each status, per robot and for the enabled fleet. Only as far back as the history is kept.");

        return group;
    }
}
