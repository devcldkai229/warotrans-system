using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Fleet.Features.GetRobot;

public static class GetRobotEndpoint
{
    public static RouteGroupBuilder MapGetRobot(this RouteGroupBuilder group)
    {
        group.MapGet("/robots/{id:guid}", async (
            Guid id,
            GetRobotHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        });

        return group;
    }
}
