using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Operations.Features.ListNotifications;

public static class ListNotificationsEndpoint
{
    public static RouteGroupBuilder MapListNotifications(this RouteGroupBuilder group)
    {
        group.MapGet("/notifications", async (
            bool? unreadOnly,
            int? take,
            ListNotificationsHandler handler,
            CancellationToken cancellationToken) =>
                Results.Ok(await handler.HandleAsync(unreadOnly ?? false, take, cancellationToken)))
            .RequireAuthorization(AuthorizationPolicies.AdminOnly)
            .WithName("ListNotifications")
            .WithSummary("Admin notifications, newest first, with the number still unread")
            .WithDescription(
                "One inbox shared by every admin. `unreadOnly` hides the ones already read; `take` defaults to 30 (max 100). " +
                "`unreadCount` always counts every unread notification, whatever `take` and `unreadOnly` are.");

        return group;
    }
}
