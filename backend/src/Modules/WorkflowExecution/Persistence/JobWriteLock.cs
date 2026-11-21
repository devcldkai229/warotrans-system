using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace WaroTrans.WorkflowExecution.Persistence;

internal static class JobWriteLock
{
    // Serialize handover, recovery and operator decisions that act on the same Job and cargo.
    internal static async Task<IDbContextTransaction?> AcquireAsync(
        WorkflowExecutionDbContext db, Guid jobId, CancellationToken cancellationToken)
    {
        if (!db.Database.IsNpgsql()) return null;

        var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT id FROM execution.jobs WHERE id = {jobId} FOR UPDATE", cancellationToken);
            return transaction;
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }
    }
}
