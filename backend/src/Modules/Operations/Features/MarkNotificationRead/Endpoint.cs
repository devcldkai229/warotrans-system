using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Operations.Features.MarkNotificationRead;

public static class MarkNotificationReadEndpoint
{
    public static RouteGroupBuilder MapMarkNotificationRead(this RouteGroupBuilder group)
    {
        group.MapPost("/notifications/{id:guid}/read", async (
            Guid id,
            MarkNotificationReadHandler handler,
            CancellationToken cancellationToken) =>
            {
                await handler.HandleAsync(id, cancellationToken);
                return Results.NoContent();
            })
            .RequireAuthorization(AuthorizationPolicies.AdminOnly)
            .WithName("MarkNotificationRead")
            .WithSummary("Mark one notification as read (for every admin)");

        return group;
    }
}
