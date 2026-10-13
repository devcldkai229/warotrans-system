using Microsoft.EntityFrameworkCore;
using Npgsql;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Features.Shared;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Navigation.Enums;
using WaroTrans.Warehouse.Contracts;

namespace WaroTrans.Fleet.Features.RegisterRobot;

public sealed class RegisterRobotHandler(
    FleetDbContext db,
    IWarehouseModule warehouseModule,
    INavigationModule navigationModule)
{
    public async Task<RobotResponse> HandleAsync(RegisterRobotRequest request, CancellationToken cancellationToken)
    {
        await EnsureWarehouseAsync(request.WarehouseId, cancellationToken);
        await EnsureMapVersionAsync(request.WarehouseId, request.CurrentMapVersionId, cancellationToken);

        var code = request.Code.Trim().ToUpperInvariant();
        var name = request.Name.Trim();

        var codeTaken = await db.Robots.AnyAsync(r => r.Code == code, cancellationToken);
        if (codeTaken)
        {
            throw new ConflictException(
                $"Robot code '{code}' already exists.",
                "robot_code_exists");
        }

        var robot = Robot.Register(
            request.WarehouseId,
            request.CurrentMapVersionId,
            code,
            name,
            DateTimeOffset.UtcNow);

        db.Robots.Add(robot);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException(
                $"Robot code '{code}' already exists.",
                "robot_code_exists");
        }

        return RobotResponse.From(robot);
    }

    private async Task EnsureWarehouseAsync(Guid warehouseId, CancellationToken cancellationToken)
    {
        var warehouse = await warehouseModule.GetWarehouseAsync(warehouseId, cancellationToken)
            ?? throw new NotFoundException($"Warehouse '{warehouseId}' was not found.", "warehouse_not_found");

        if (!warehouse.IsActive)
        {
            throw new DomainValidationException($"Warehouse '{warehouse.Code}' is inactive.", "warehouse_inactive");
        }
    }

    private async Task EnsureMapVersionAsync(Guid warehouseId, Guid mapVersionId, CancellationToken cancellationToken)
    {
        var mapVersion = await navigationModule.GetMapVersionAsync(mapVersionId, cancellationToken)
            ?? throw new NotFoundException($"MapVersion '{mapVersionId}' was not found.", "map_version_not_found");

        if (mapVersion.WarehouseId != warehouseId)
        {
            throw new DomainValidationException(
                $"MapVersion '{mapVersionId}' does not belong to Warehouse '{warehouseId}'.",
                "map_version_warehouse_mismatch");
        }

        if (mapVersion.Status != MapStatus.PUBLISHED)
        {
            throw new DomainValidationException(
                $"MapVersion '{mapVersionId}' must be PUBLISHED (current: {mapVersion.Status}).",
                "map_version_not_published");
        }
    }
}
