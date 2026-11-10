using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Fleet.Features.PutRobotInService;

public static class PutRobotInServiceEndpoint
{
    public static RouteGroupBuilder MapPutRobotInService(this RouteGroupBuilder group)
    {
        // Admin decision after the robot's readiness checks: from here on it can be dispatched.
        group.MapPost("/robots/{id:guid}/put-in-service", async (
            Guid id,
            PutRobotInServiceHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        })
            .RequirePermission(Permissions.RobotConfigure)
            .RequireRobotScope()
            .Audited("robot.put_in_service", "ROBOT", "id");

        return group;
    }
}
