using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Operations.Contracts;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Services;

public sealed class NotificationService(
    OperationsMongoContext mongo,
    IIntegrationEventPublisher events,
    TimeProvider clock) : INotificationService
{
    /// <summary>How long after a notification an identical one (same dedupe key) is still dropped once it has been read.</summary>
    public static readonly TimeSpan DuplicateWindow = TimeSpan.FromMinutes(10);

    public async Task<Guid?> PublishAsync(NotificationDraft draft, CancellationToken cancellationToken = default)
    {
        var now = clock.GetUtcNow();
        var f = Builders<Notification>.Filter;

        if (draft.DedupeKey is not null)
        {
            var nobodyReadIt = f.And(
                f.Eq(n => n.IsRead, false),
                f.Or(f.Exists(n => n.Reads, false), f.Size(n => n.Reads, 0)));

            var open = f.And(
                f.Eq(n => n.DedupeKey, draft.DedupeKey),
                f.Eq(n => n.ResolvedAt, null),
                draft.OncePerSituation
                    ? FilterDefinition<Notification>.Empty
                    : f.Or(nobodyReadIt, f.Gte(n => n.CreatedAt, now - DuplicateWindow)));

            if (await mongo.Notifications.Find(open).AnyAsync(cancellationToken))
            {
                return null;
            }
        }

        var audience = draft.Audience ?? NotificationAudience.Admins;
        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            ReceiverAccountId = audience.AccountId ?? Notification.EveryAdmin,
            RecipientRoles = audience.AccountId is null ? audience.Roles.Distinct().ToList() : [],
            RobotId = audience.RobotId ?? (draft.EntityType == "ROBOT" ? draft.EntityId : null),
            Type = draft.Type,
            Kind = draft.Kind,
            Title = draft.Title,
            Content = draft.Content,
            RelatedEntity = draft.EntityType is null || draft.EntityId is null
                ? null
                : new RelatedEntityRef { Type = draft.EntityType, Id = draft.EntityId.Value },
            Route = NotificationRoutes.For(draft.EntityType, draft.EntityId),
            DedupeKey = draft.DedupeKey,
            CreatedAt = now
        };

        await mongo.Notifications.InsertOneAsync(notification, cancellationToken: cancellationToken);
        await events.PublishAsync(
            new NotificationCreated(
                notification.Id,
                notification.Type,
                notification.Kind,
                notification.Title,
                notification.Content,
                notification.RelatedEntity?.Type,
                notification.RelatedEntity?.Id,
                notification.CreatedAt,
                audience.AccountId,
                notification.RecipientRoles,
                notification.RobotId,
                notification.Route),
            cancellationToken);

        return notification.Id;
    }

    public async Task ResolveAsync(string dedupeKey, CancellationToken cancellationToken = default)
    {
        await mongo.Notifications.UpdateManyAsync(
            Builders<Notification>.Filter.And(
                Builders<Notification>.Filter.Eq(n => n.DedupeKey, dedupeKey),
                Builders<Notification>.Filter.Eq(n => n.ResolvedAt, null)),
            Builders<Notification>.Update.Set(n => n.ResolvedAt, clock.GetUtcNow()),
            cancellationToken: cancellationToken);
    }
}

/// <summary>Which notifications one signed-in person may see, and which of those they have not read yet.</summary>
public static class NotificationVisibility
{
    public static FilterDefinition<Notification> VisibleTo(Guid accountId, string? role, RobotScope scope)
    {
        var f = Builders<Notification>.Filter;
        var roleMatches = role == AppRoles.Admin
            // Documents written before OPS-03 have no roles: they were for the admins.
            ? f.Or(f.AnyEq(n => n.RecipientRoles, role), f.Exists(n => n.RecipientRoles, false), f.Size(n => n.RecipientRoles, 0))
            : f.AnyEq(n => n.RecipientRoles, role ?? string.Empty);

        var forMyRole = f.And(f.Eq(n => n.ReceiverAccountId, Notification.EveryAdmin), roleMatches);
        if (!scope.AllRobots)
        {
            var robots = scope.RobotIds.Cast<Guid?>().ToList();
            forMyRole = f.And(forMyRole, f.Or(f.Eq(n => n.RobotId, null), f.In(n => n.RobotId, robots)));
        }

        return f.Or(f.Eq(n => n.ReceiverAccountId, accountId), forMyRole);
    }

    public static FilterDefinition<Notification> UnreadBy(Guid accountId)
    {
        var f = Builders<Notification>.Filter;
        return f.And(
            f.Eq(n => n.IsRead, false),
            f.Not(f.ElemMatch(n => n.Reads, r => r.AccountId == accountId)));
    }
}
