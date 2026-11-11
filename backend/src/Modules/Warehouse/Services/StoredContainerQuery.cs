using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Enums;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Services;

public sealed class StoredContainerQuery(WarehouseDbContext db) : IStoredContainerQuery
{
    private const int Limit = 500;

    public async Task<IReadOnlyList<StoredContainer>> GetStoredAsync(
        Guid productId,
        Guid storageLocationId,
        CancellationToken cancellationToken = default) =>
        await db.Containers.AsNoTracking()
            .Where(c => c.ProductId == productId
                && c.CurrentStorageLocationId == storageLocationId
                && c.Status == ContainerStatus.STORED)
            .OrderBy(c => c.UpdatedAt)
            .ThenBy(c => c.Id)
            .Take(Limit)
            .Select(c => new StoredContainer(c.Id, c.CurrentLevelNo))
            .ToListAsync(cancellationToken);
}
