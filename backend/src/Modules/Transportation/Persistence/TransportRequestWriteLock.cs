using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace WaroTrans.Transportation.Persistence;

internal static class TransportRequestWriteLock
{
    internal static async Task<IDbContextTransaction?> AcquireAsync(
        TransportationDbContext db, Guid requestId, CancellationToken cancellationToken)
    {
        if (!db.Database.IsNpgsql()) return null;

        var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT id FROM transportation.transport_requests WHERE id = {requestId} FOR UPDATE", cancellationToken);
            return transaction;
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }
    }
}
