using Microsoft.AspNetCore.SignalR;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Host.Hubs;
using WaroTrans.Operations.Contracts;

namespace WaroTrans.Host.Realtime;

/// <summary>Pushes a new notification to the admins' browsers as "notificationCreated"; clients add it to their bell.</summary>
public sealed class SignalRNotificationForwarder(IHubContext<NotificationsHub> hub)
    : IIntegrationEventHandler<NotificationCreated>
{
    public Task HandleAsync(NotificationCreated e, CancellationToken cancellationToken = default) =>
        hub.Clients.Group(NotificationsHub.AdminsGroup).SendAsync(
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
                e.CreatedAt
            },
            cancellationToken);
}
