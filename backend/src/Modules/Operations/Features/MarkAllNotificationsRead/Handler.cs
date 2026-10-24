using MongoDB.Driver;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;

namespace WaroTrans.Operations.Features.MarkAllNotificationsRead;

public sealed class MarkAllNotificationsReadHandler(OperationsMongoContext mongo, TimeProvider clock)
{
    public Task HandleAsync(CancellationToken cancellationToken) =>
        mongo.Notifications.UpdateManyAsync(
            Builders<Notification>.Filter.And(
                Builders<Notification>.Filter.Eq(n => n.ReceiverAccountId, Notification.EveryAdmin),
                Builders<Notification>.Filter.Eq(n => n.IsRead, false)),
            Builders<Notification>.Update.Set(n => n.IsRead, true).Set(n => n.ReadAt, clock.GetUtcNow()),
            cancellationToken: cancellationToken);
}
