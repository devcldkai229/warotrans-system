using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Fleet.Features.EnableRobot;

public static class EnableRobotEndpoint
{
    public static RouteGroupBuilder MapEnableRobot(this RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/enable", async (
            Guid id,
            EnableRobotHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
