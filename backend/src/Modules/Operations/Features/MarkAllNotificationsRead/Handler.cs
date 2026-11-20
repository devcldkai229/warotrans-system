using MongoDB.Driver;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Operations.Documents;
using WaroTrans.Operations.Persistence;
using WaroTrans.Operations.Services;

namespace WaroTrans.Operations.Features.MarkAllNotificationsRead;

public sealed class MarkAllNotificationsReadHandler(
    OperationsMongoContext mongo,
    ICurrentUser currentUser,
    IRobotAccessScope robotAccessScope,
    TimeProvider clock,
    IStaffOperatingWarehouse staffWarehouse)
{
    public async Task HandleAsync(CancellationToken cancellationToken)
    {
        if (currentUser.AccountId is not { } me)
        {
            return;
        }

        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        var warehouse = currentUser.Role == AppRoles.Staff ? await staffWarehouse.GetOperatingWarehouseIdAsync(cancellationToken) : null;
        await mongo.Notifications.UpdateManyAsync(
            Builders<Notification>.Filter.And(
                NotificationVisibility.VisibleTo(me, currentUser.Role, scope, warehouse),
                NotificationVisibility.UnreadBy(me)),
            Builders<Notification>.Update.Push(n => n.Reads, new NotificationRead { AccountId = me, ReadAt = clock.GetUtcNow() }),
            cancellationToken: cancellationToken);
    }
}
