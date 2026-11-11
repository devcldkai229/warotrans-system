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
            string? type,
            string? kind,
            int? skip,
            int? take,
            ListNotificationsHandler handler,
            CancellationToken cancellationToken) =>
                Results.Ok(await handler.HandleAsync(new ListNotificationsQuery(unreadOnly ?? false, type, kind, skip, take), cancellationToken)))
            .RequirePermission(Permissions.NotificationRead)
            .WithName("ListNotifications")
            .WithSummary("The signed-in person's notifications, newest first, with the number they have not read")
            .WithDescription(
                "Notifications addressed to the caller or to their role (Technicians: only their robots). Read state is per person. `unreadOnly` hides the ones already read; `type` (INFO, WARNING, ALERT, ASSIGNMENT, SYSTEM) and `kind` (JOB_FAILED, ROBOT_OFFLINE …) narrow the list. " +
                "Page with `skip` and `take` (default 30, max 100); `total` is the number of notifications matching the filters. " +
                "`unreadCount` always counts every unread notification, whatever the filters and paging are.");

        return group;
    }
}
