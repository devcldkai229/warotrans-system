using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Features.MarkNotificationRead;

public sealed class MarkNotificationReadHandler(OperationsMongoContext mongo, TimeProvider clock)
{
    public async Task HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var shared = Builders<Notification>.Filter.And(
            Builders<Notification>.Filter.Eq(n => n.Id, id),
            Builders<Notification>.Filter.Eq(n => n.ReceiverAccountId, Notification.EveryAdmin));

        if (!await mongo.Notifications.Find(shared).AnyAsync(cancellationToken))
        {
            throw new NotFoundException($"Notification '{id}' was not found.", "notification_not_found");
        }

        // Reading one that is already read is fine: the first ReadAt stays.
        await mongo.Notifications.UpdateOneAsync(
            Builders<Notification>.Filter.And(shared, Builders<Notification>.Filter.Eq(n => n.IsRead, false)),
            Builders<Notification>.Update.Set(n => n.IsRead, true).Set(n => n.ReadAt, clock.GetUtcNow()),
            cancellationToken: cancellationToken);
    }
}
