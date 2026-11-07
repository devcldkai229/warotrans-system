using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Fleet.Features.ChangeRobotMap;

public static class ChangeRobotMapEndpoint
{
    public static RouteGroupBuilder MapChangeRobotMap(this RouteGroupBuilder group)
    {
        group.MapPut("/robots/{id:guid}/map", async (
            Guid id,
            ChangeRobotMapRequest request,
            ChangeRobotMapHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Ok(response);
        })
        .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}
