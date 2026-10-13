using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Fleet.Features.DisableRobot;

public static class DisableRobotEndpoint
{
    public static RouteGroupBuilder MapDisableRobot(this RouteGroupBuilder group)
    {
        group.MapPost("/robots/{id:guid}/disable", async (
            Guid id,
            DisableRobotHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
