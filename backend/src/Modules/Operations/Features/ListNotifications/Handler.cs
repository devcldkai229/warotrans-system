using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;
using WaroTrans.Operations.Services;

namespace WaroTrans.Operations.Features.ListNotifications;

public sealed class ListNotificationsHandler(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IRobotAccessScope robotAccessScope)
{
    public const int DefaultTake = 30;
    public const int MaxTake = 100;

    public async Task<ListNotificationsResponse> HandleAsync(
        bool unreadOnly,
        int? take,
        CancellationToken cancellationToken)
    {
        if (currentUser.AccountId is not { } me)
        {
            return new ListNotificationsResponse(0, []);
        }

        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        var visible = NotificationVisibility.VisibleTo(me, currentUser.Role, scope);
        var unread = Builders<Notification>.Filter.And(visible, NotificationVisibility.UnreadBy(me));

        var items = await mongo.Notifications
            .Find(unreadOnly ? unread : visible)
            .SortByDescending(n => n.CreatedAt)
            .Limit(Math.Clamp(take ?? DefaultTake, 1, MaxTake))
            .ToListAsync(cancellationToken);
        var unreadCount = await mongo.Notifications.CountDocumentsAsync(unread, cancellationToken: cancellationToken);

        return new ListNotificationsResponse(
            (int)unreadCount,
            items.Select(n =>
                {
                    var mine = n.Reads.FirstOrDefault(r => r.AccountId == me);
                    return new NotificationDto(
                        n.Id,
                        n.Type.ToString(),
                        n.Kind,
                        n.Title,
                        n.Content,
                        n.RelatedEntity?.Type,
                        n.RelatedEntity?.Id,
                        n.CreatedAt,
                        n.IsRead || mine is not null,
                        mine?.ReadAt ?? n.ReadAt,
                        n.ResolvedAt,
                        n.Route);
                })
                .ToList());
    }
}
