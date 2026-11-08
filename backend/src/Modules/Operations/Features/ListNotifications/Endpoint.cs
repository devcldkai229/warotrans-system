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
            .RequirePermission(Permissions.NotificationRead)
            .WithName("ListNotifications")
            .WithSummary("The signed-in person's notifications, newest first, with the number they have not read")
            .WithDescription(
                "Notifications addressed to the caller or to their role (Technicians: only their robots). Read state is per person. `unreadOnly` hides the ones already read; `take` defaults to 30 (max 100). " +
                "`unreadCount` always counts every unread notification, whatever `take` and `unreadOnly` are.");

        return group;
    }
}
