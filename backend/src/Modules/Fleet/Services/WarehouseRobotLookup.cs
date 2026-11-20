using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

internal sealed class WarehouseRobotLookup(FleetDbContext db) : IWarehouseRobotLookup
{
    public async Task<IReadOnlyList<Guid>> GetWarehousesAsync(IReadOnlyCollection<Guid> robotIds, CancellationToken cancellationToken) =>
        robotIds.Count == 0 ? [] : await db.Robots.AsNoTracking().Where(robot => robotIds.Contains(robot.Id))
            .Select(robot => robot.WarehouseId).Distinct().ToListAsync(cancellationToken);
}
