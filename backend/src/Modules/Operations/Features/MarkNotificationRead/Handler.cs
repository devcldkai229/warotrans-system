using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;
using WaroTrans.Operations.Services;

namespace WaroTrans.Operations.Features.MarkNotificationRead;

public sealed class MarkNotificationReadHandler(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IRobotAccessScope robotAccessScope,
    TimeProvider clock)
{
    /// <summary>Marks it read for the caller only. Another person's notification is "not found", not "forbidden".</summary>
    public async Task HandleAsync(Guid id, CancellationToken cancellationToken)
    {
        var me = currentUser.AccountId ?? throw new NotFoundException($"Notification '{id}' was not found.", "notification_not_found");
        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        var f = Builders<Notification>.Filter;
        var mineToSee = f.And(f.Eq(n => n.Id, id), NotificationVisibility.VisibleTo(me, currentUser.Role, scope));

        if (!await mongo.Notifications.Find(mineToSee).AnyAsync(cancellationToken))
        {
            throw new NotFoundException($"Notification '{id}' was not found.", "notification_not_found");
        }

        // Reading one that is already read is fine: the first read time stays.
        await mongo.Notifications.UpdateOneAsync(
            f.And(mineToSee, f.Not(f.ElemMatch(n => n.Reads, r => r.AccountId == me))),
            Builders<Notification>.Update.Push(n => n.Reads, new NotificationRead { AccountId = me, ReadAt = clock.GetUtcNow() }),
            cancellationToken: cancellationToken);
    }
}
