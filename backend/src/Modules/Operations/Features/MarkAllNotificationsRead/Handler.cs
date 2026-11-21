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
    IStaffOperatingWarehouse staffWarehouse,
    IWarehouseRobotLookup robotLookup)
{
    public async Task HandleAsync(CancellationToken cancellationToken)
    {
        if (currentUser.AccountId is not { } me)
        {
            return;
        }

        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        var visible = await NotificationVisibility.VisibleToAsync(me, currentUser.Role, scope, staffWarehouse, robotLookup, cancellationToken);
        await mongo.Notifications.UpdateManyAsync(
            Builders<Notification>.Filter.And(
                visible,
                NotificationVisibility.UnreadBy(me)),
            Builders<Notification>.Update.Push(n => n.Reads, new NotificationRead { AccountId = me, ReadAt = clock.GetUtcNow() }),
            cancellationToken: cancellationToken);
    }
}
