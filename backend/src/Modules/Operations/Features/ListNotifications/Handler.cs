using MongoDB.Driver;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Features.ListNotifications;

public sealed class ListNotificationsHandler(OperationsMongoContext mongo)
{
    public const int DefaultTake = 30;
    public const int MaxTake = 100;

    public async Task<ListNotificationsResponse> HandleAsync(
        bool unreadOnly,
        int? take,
        CancellationToken cancellationToken)
    {
        var shared = Builders<Notification>.Filter.Eq(n => n.ReceiverAccountId, Notification.EveryAdmin);
        var unread = Builders<Notification>.Filter.And(shared, Builders<Notification>.Filter.Eq(n => n.IsRead, false));

        var items = await mongo.Notifications
            .Find(unreadOnly ? unread : shared)
            .SortByDescending(n => n.CreatedAt)
            .Limit(Math.Clamp(take ?? DefaultTake, 1, MaxTake))
            .ToListAsync(cancellationToken);
        var unreadCount = await mongo.Notifications.CountDocumentsAsync(unread, cancellationToken: cancellationToken);

        return new ListNotificationsResponse(
            (int)unreadCount,
            items.Select(n => new NotificationDto(
                    n.Id,
                    n.Type.ToString(),
                    n.Kind,
                    n.Title,
                    n.Content,
                    n.RelatedEntity?.Type,
                    n.RelatedEntity?.Id,
                    n.CreatedAt,
                    n.IsRead,
                    n.ReadAt,
                    n.ResolvedAt))
                .ToList());
    }
}
