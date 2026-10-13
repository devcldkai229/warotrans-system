using Microsoft.EntityFrameworkCore;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Services;

public sealed class WarehouseModuleApi(WarehouseDbContext dbContext) : IWarehouseModule
{
    public Task<WarehouseSnapshot?> GetWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken = default) =>
        dbContext.Warehouses
            .AsNoTracking()
            .Where(w => w.Id == warehouseId)
            .Select(w => new WarehouseSnapshot(w.Id, w.Code, w.IsActive))
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<ContainerSnapshot>> GetContainersAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default)
    {
        if (containerIds.Count == 0)
        {
            return [];
        }

        return await dbContext.Containers
            .AsNoTracking()
            .Where(c => containerIds.Contains(c.Id))
            .Select(c => new ContainerSnapshot(c.Id, c.Barcode, c.Status))
            .ToListAsync(cancellationToken);
    }
}
