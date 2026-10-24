using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
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

        if (draft.DedupeKey is not null)
        {
            var open = Builders<Notification>.Filter.And(
                Builders<Notification>.Filter.Eq(n => n.ReceiverAccountId, Notification.EveryAdmin),
                Builders<Notification>.Filter.Eq(n => n.DedupeKey, draft.DedupeKey),
                Builders<Notification>.Filter.Eq(n => n.ResolvedAt, null),
                draft.OncePerSituation
                    ? FilterDefinition<Notification>.Empty
                    : Builders<Notification>.Filter.Or(
                        Builders<Notification>.Filter.Eq(n => n.IsRead, false),
                        Builders<Notification>.Filter.Gte(n => n.CreatedAt, now - DuplicateWindow)));

            if (await mongo.Notifications.Find(open).AnyAsync(cancellationToken))
            {
                return null;
            }
        }

        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            ReceiverAccountId = Notification.EveryAdmin,
            Type = draft.Type,
            Kind = draft.Kind,
            Title = draft.Title,
            Content = draft.Content,
            RelatedEntity = draft.EntityType is null || draft.EntityId is null
                ? null
                : new RelatedEntityRef { Type = draft.EntityType, Id = draft.EntityId.Value },
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
                notification.CreatedAt),
            cancellationToken);

        return notification.Id;
    }

    public async Task ResolveAsync(string dedupeKey, CancellationToken cancellationToken = default)
    {
        await mongo.Notifications.UpdateManyAsync(
            Builders<Notification>.Filter.And(
                Builders<Notification>.Filter.Eq(n => n.ReceiverAccountId, Notification.EveryAdmin),
                Builders<Notification>.Filter.Eq(n => n.DedupeKey, dedupeKey),
                Builders<Notification>.Filter.Eq(n => n.ResolvedAt, null)),
            Builders<Notification>.Update.Set(n => n.ResolvedAt, clock.GetUtcNow()),
            cancellationToken: cancellationToken);
    }
}
