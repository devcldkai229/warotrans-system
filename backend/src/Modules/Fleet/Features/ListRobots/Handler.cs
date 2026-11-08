using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.ListRobots;

public sealed class ListRobotsHandler(FleetDbContext db, IRobotAccessScope robotAccessScope)
{
    public async Task<ListRobotsResponse> HandleAsync(ListRobotsRequest request, CancellationToken cancellationToken)
    {
        var query = db.Robots.AsNoTracking().AsQueryable();

        // A Technician only sees the robots assigned to them (RB-01).
        var scope = await robotAccessScope.GetCurrentAsync(cancellationToken);
        if (!scope.AllRobots)
        {
            var allowed = scope.RobotIds.ToList();
            query = query.Where(r => allowed.Contains(r.Id));
        }

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
