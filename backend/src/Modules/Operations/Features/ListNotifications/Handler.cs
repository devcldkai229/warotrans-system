using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Enums;
using WaroTrans.Operations.Persistence;
using WaroTrans.Operations.Services;

namespace WaroTrans.Operations.Features.ListNotifications;

/// <param name="Type">A <see cref="NotificationType"/> name; anything else matches nothing.</param>
/// <param name="Kind">Machine name of the situation, e.g. JOB_FAILED.</param>
public sealed record ListNotificationsQuery(bool UnreadOnly, string? Type, string? Kind, int? Skip, int? Take);

public sealed class ListNotificationsHandler(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IRobotAccessScope robotAccessScope)
{
    public const int DefaultTake = 30;
    public const int MaxTake = 100;
    public const int MaxSkip = 10_000;

    public async Task<ListNotificationsResponse> HandleAsync(
        ListNotificationsQuery query,
        CancellationToken cancellationToken)
    {
        if (currentUser.AccountId is not { } me)
        {
            return new ListNotificationsResponse(0, []);
        }

        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        var visible = NotificationVisibility.VisibleTo(me, currentUser.Role, scope);
        var unread = Builders<Notification>.Filter.And(visible, NotificationVisibility.UnreadBy(me));

        var f = Builders<Notification>.Filter;
        var matching = new List<FilterDefinition<Notification>> { query.UnreadOnly ? unread : visible };
        if (!string.IsNullOrWhiteSpace(query.Type))
        {
            // An unknown type is not an error: nothing has it, so the list is empty.
            matching.Add(Enum.TryParse<NotificationType>(query.Type.Trim(), ignoreCase: true, out var type)
                ? f.Eq(n => n.Type, type)
                : f.In(n => n.Type, Array.Empty<NotificationType>()));
        }

        if (!string.IsNullOrWhiteSpace(query.Kind))
        {
            matching.Add(f.Eq(n => n.Kind, query.Kind.Trim().ToUpperInvariant()));
        }

        var filter = f.And(matching);
        var items = await mongo.Notifications
            .Find(filter)
            // Id breaks ties between notifications raised in the same instant, so a page never repeats or skips one.
            .Sort(Builders<Notification>.Sort.Descending(n => n.CreatedAt).Descending(n => n.Id))
            .Skip(Math.Clamp(query.Skip ?? 0, 0, MaxSkip))
            .Limit(Math.Clamp(query.Take ?? DefaultTake, 1, MaxTake))
            .ToListAsync(cancellationToken);
        var total = await mongo.Notifications.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
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
                .ToList(),
            (int)total);
    }
}
