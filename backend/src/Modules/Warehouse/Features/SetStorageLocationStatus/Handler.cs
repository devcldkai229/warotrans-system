using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Features.ListStorageLocations;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.SetStorageLocationStatus;

public sealed class SetStorageLocationStatusHandler(
    WarehouseDbContext dbContext,
    IMapEndpointCatalog endpointCatalog,
    ICurrentUser currentUser,
    ILogger<SetStorageLocationStatusHandler> logger)
{
    public async Task<StorageLocationListItemResponse> HandleAsync(
        Guid id,
        SetStorageLocationStatusRequest request,
        CancellationToken cancellationToken = default)
    {
        var location = await dbContext.StorageLocations.SingleOrDefaultAsync(l => l.Id == id, cancellationToken)
            ?? throw new NotFoundException($"Storage location '{id}' was not found.", "storage_location_not_found");

        // Setting the status it already has is accepted and changes nothing.
        if (location.IsActive != request.IsActive)
        {
            if (!request.IsActive)
            {
                var held = await dbContext.Containers.CountAsync(c => c.CurrentStorageLocationId == id, cancellationToken);
                if (held > 0)
                {
                    throw new ConflictException(
                        $"Storage location '{location.Code}' still holds {held} container(s). Move them first.",
                        "storage_location_in_use");
                }
            }

            location.IsActive = request.IsActive;
            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "Storage location {LocationId} set to {Status} by {AccountId}",
                location.Id,
                request.IsActive ? "active" : "inactive",
                currentUser.AccountId);
        }

        var warehouseName = await dbContext.Warehouses
            .AsNoTracking()
            .Where(w => w.Id == location.WarehouseId)
            .Select(w => w.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;
        var endpoint = (await endpointCatalog.GetEndpointsAsync([location.EndpointId], cancellationToken)).FirstOrDefault();

        return StorageLocationListItemResponse.From(location, warehouseName, endpoint);
    }
}
