using Microsoft.EntityFrameworkCore;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.ListRobots;

public sealed class ListRobotsHandler(FleetDbContext db)
{
    public async Task<ListRobotsResponse> HandleAsync(ListRobotsRequest request, CancellationToken cancellationToken)
    {
        var query = db.Robots.AsNoTracking().AsQueryable();

        if (request.WarehouseId is { } warehouseId)
        {
            query = query.Where(r => r.WarehouseId == warehouseId);
        }

        if (request.Status is { } status)
        {
            query = query.Where(r => r.Status == status);
        }

        if (request.IsEnabled is { } isEnabled)
        {
            query = query.Where(r => r.IsEnabled == isEnabled);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLowerInvariant();
            query = query.Where(r =>
                r.Code.ToLower().Contains(term) ||
                r.Name.ToLower().Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var robots = await query
            .OrderBy(r => r.Code)
            .Skip(request.Skip)
            .Take(request.Take)
            .ToListAsync(cancellationToken);

        var items = robots.Select(RobotResponse.From).ToList();
        return new ListRobotsResponse(items, total);
    }
}
