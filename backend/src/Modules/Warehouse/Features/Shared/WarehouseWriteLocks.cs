using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.Shared;

/// <summary>All locks live inside the caller's transaction; sorted product locks also cover initially absent stock rows.</summary>
internal static class WarehouseWriteLocks
{
    public static async Task ReceivingRequestAsync(WarehouseDbContext db, Guid requestId, CancellationToken ct)
    {
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({requestId.ToString()}, 64217))", ct);
    }

    public static async Task<StockVoucher> VoucherAsync(WarehouseDbContext db, Guid id, CancellationToken ct)
    {
        if (db.Database.IsNpgsql())
            await db.StockVouchers.FromSqlInterpolated($"SELECT * FROM warehouse.stock_vouchers WHERE id = {id} FOR UPDATE").AsNoTracking().ToListAsync(ct);
        var local = db.StockVouchers.Local.SingleOrDefault(v => v.Id == id);
        if (local is not null && db.Entry(local).State == EntityState.Unchanged)
            await db.Entry(local).ReloadAsync(ct);
        return await StockVoucherStore.LoadAsync(db, id, ct);
    }

    public static async Task<IReadOnlyList<Container>> ContainersAsync(WarehouseDbContext db, IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        if (db.Database.IsNpgsql())
        {
            var tracked = db.Containers.Local.Where(c => ids.Contains(c.Id)).Select(c => c.Id).ToHashSet();
            var rows = await db.Containers.FromSqlInterpolated($"SELECT * FROM warehouse.containers WHERE id = ANY({ids.ToArray()}) ORDER BY id FOR UPDATE").ToListAsync(ct);
            foreach (var row in rows.Where(c => tracked.Contains(c.Id))) await db.Entry(row).ReloadAsync(ct);
            return rows;
        }
        return await db.Containers.Where(c => ids.Contains(c.Id)).OrderBy(c => c.Id).ToListAsync(ct);
    }

    public static async Task StockAsync(WarehouseDbContext db, IEnumerable<Guid> productIds, CancellationToken ct)
    {
        if (!db.Database.IsNpgsql()) return;
        var ids = productIds.Distinct().Order().ToArray();
        foreach (var id in ids)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({id.ToString()}, 43291))", ct);
        foreach (var row in db.InventoryStocks.Local.Where(s => ids.Contains(s.ProductId) && db.Entry(s).State == EntityState.Unchanged).ToArray())
            await db.Entry(row).ReloadAsync(ct);
    }
}
