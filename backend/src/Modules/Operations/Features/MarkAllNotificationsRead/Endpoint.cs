using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Operations.Features.MarkAllNotificationsRead;

public static class MarkAllNotificationsReadEndpoint
{
    public static RouteGroupBuilder MapMarkAllNotificationsRead(this RouteGroupBuilder group)
    {
        group.MapPost("/notifications/read-all", async (
            MarkAllNotificationsReadHandler handler,
            CancellationToken cancellationToken) =>
            {
                await handler.HandleAsync(cancellationToken);
                return Results.NoContent();
            })
            .RequirePermission(Permissions.NotificationRead)
            .WithName("MarkAllNotificationsRead")
            .WithSummary("Mark every notification the signed-in person has not read yet as read");

        return group;
    }
}
