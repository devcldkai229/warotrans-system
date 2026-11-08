using Microsoft.AspNetCore.SignalR;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Host.Hubs;
using WaroTrans.Operations.Contracts;

namespace WaroTrans.Host.Realtime;

/// <summary>
/// Pushes a new notification as "notificationCreated" to its audience (OPS-03): the one receiver, or everyone in its
/// roles. A robot notification reaches Technicians only through the group of that robot, i.e. only those assigned to it.
/// </summary>
public sealed class SignalRNotificationForwarder(IHubContext<NotificationsHub> hub)
    : IIntegrationEventHandler<NotificationCreated>
{
    public Task HandleAsync(NotificationCreated e, CancellationToken cancellationToken = default) =>
        hub.Clients.Groups(GroupsFor(e)).SendAsync(
            "notificationCreated",
            new
            {
                id = e.NotificationId,
                type = e.Type.ToString(),
                e.Kind,
                e.Title,
                e.Content,
                e.EntityType,
                e.EntityId,
                e.Route,
                e.CreatedAt
            },
            cancellationToken);

    internal static IReadOnlyList<string> GroupsFor(NotificationCreated e)
    {
        if (e.ReceiverAccountId is { } receiver)
        {
            return [RealtimeGroups.User(receiver)];
        }

        // Older producers did not name roles: those were admin notifications.
        var roles = e.RecipientRoles is { Count: > 0 } named ? named : [AppRoles.Admin];
        var groups = new List<string>();
        foreach (var role in roles.Distinct())
        {
            if (role == AppRoles.Technician && e.RobotId is { } robotId)
            {
                // Only Technicians join robot:{id} groups (everyone else is in robots:all), and only for their robots.
                groups.Add(RealtimeGroups.Robot(robotId));
            }
            else
            {
                groups.Add(RealtimeGroups.Role(role));
            }
        }

        return groups;
    }
}
