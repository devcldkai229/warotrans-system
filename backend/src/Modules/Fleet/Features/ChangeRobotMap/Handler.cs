using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;

namespace WaroTrans.Fleet.Features.ChangeRobotMap;

public sealed record ChangeRobotMapRequest(Guid MapVersionId);

public sealed class ChangeRobotMapHandler(FleetDbContext db, INavigationModule navigation)
{
    private const int MaxSaveAttempts = 5;

    public async Task<RobotResponse> HandleAsync(Guid id, ChangeRobotMapRequest request, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await ChangeAsync(id, request, cancellationToken);
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxSaveAttempts)
            {
                // Telemetry (several per second) updated the robot row between read and save: retry from a fresh read.
                db.ChangeTracker.Clear();
            }
        }
    }

    private async Task<RobotResponse> ChangeAsync(Guid id, ChangeRobotMapRequest request, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
        var map = await navigation.GetMapVersionAsync(request.MapVersionId, cancellationToken)
            ?? throw new NotFoundException($"Map version '{request.MapVersionId}' was not found.", "map_version_not_found");
        if (map.WarehouseId != robot.WarehouseId)
        {
            throw new DomainValidationException("The map version belongs to another warehouse.", "map_version_warehouse_mismatch");
        }

        if (map.Status != MapStatus.PUBLISHED)
        {
            throw new ConflictException($"Map version {request.MapVersionId} is not PUBLISHED.", "map_version_not_published");
        }

        robot.ChangeMap(request.MapVersionId, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return RobotResponse.From(robot);
    }
}
