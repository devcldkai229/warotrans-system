using Microsoft.EntityFrameworkCore;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Persistence;

namespace WaroTrans.Transportation.Services;

internal static class TransportReservations
{
    private static readonly TransportRequestDetailStatus[] ActiveStatuses =
    [
        TransportRequestDetailStatus.PENDING,
        TransportRequestDetailStatus.QUEUED,
        TransportRequestDetailStatus.IN_PROGRESS,
        TransportRequestDetailStatus.CANCEL_PENDING_RECOVERY
    ];

    public static IQueryable<TransportRequestDetail> ActiveDetails(TransportationDbContext db) =>
        db.TransportRequestDetails.AsNoTracking().Where(d => ActiveStatuses.Contains(d.Status));

    public static IQueryable<Guid> UnavailableContainers(TransportationDbContext db, Guid? warehouseId = null) =>
        ActiveDetails(db).Where(d => warehouseId == null || d.TransportRequest.WarehouseId == warehouseId).Select(d => d.ContainerId)
            .Concat(from posting in db.StockPostings.AsNoTracking()
                    join request in db.TransportRequests.AsNoTracking() on posting.TransportRequestId equals request.Id
                    where posting.PostedAt == null && (warehouseId == null || request.WarehouseId == warehouseId)
                    select posting.ContainerId);

    // Every request writer uses the same transaction-scoped locks before checking active reservation state.
    // Sorting the lock keys lets requests with overlapping selections complete without a lock-order cycle.
    public static async Task LockAsync(TransportationDbContext db, Guid[] containerIds, CancellationToken ct)
    {
        if (!db.Database.IsNpgsql()) return;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            SELECT pg_advisory_xact_lock(keys.lock_key)
            FROM (
                SELECT DISTINCT hashtextextended(container_id::text, 713901) AS lock_key
                FROM unnest({containerIds}::uuid[]) AS ids(container_id)
                ORDER BY lock_key
            ) AS keys
            """, ct);
    }
}
