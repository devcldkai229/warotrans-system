using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Warehouse.Contracts;
using WaroTrans.Warehouse.Entities;
using WaroTrans.Warehouse.Features.CreateContainer;
using WaroTrans.Warehouse.Persistence;

namespace WaroTrans.Warehouse.Features.Shared;

public sealed class ReceivingLocationResolver(WarehouseDbContext db, IMapEndpointCatalog navigation, IOptions<ReceivingOptions> options)
{
    public async Task<StorageLocation> ResolveAsync(Guid warehouseId, CancellationToken ct)
    {
        if (!await db.Warehouses.AsNoTracking().AnyAsync(w => w.Id == warehouseId && w.IsActive, ct))
            throw new NotFoundException("The warehouse was not found or is inactive.", "warehouse_not_found");
        if (!options.Value.InboundStorageLocations.TryGetValue(warehouseId.ToString(), out var locationId) || locationId == Guid.Empty)
            throw new ConflictException("An inbound storage location has not been configured for this warehouse.", "inbound_location_not_configured");
        var location = await db.StorageLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct);
        if (location is null || !location.IsActive || location.WarehouseId != warehouseId)
            throw new ConflictException("The configured inbound storage location is unavailable or belongs to another warehouse.", "inbound_location_invalid");
        var endpoints = await navigation.GetPublishedEndpointsAsync(warehouseId, ct);
        var endpoint = endpoints.SingleOrDefault(e => e.Id == location.EndpointId);
        if (endpoint is null || !endpoint.IsEnabled || endpoint.EndpointType != "WAYPOINT")
            throw new ConflictException("The inbound endpoint must be enabled on the warehouse's active published map.", "inbound_endpoint_unavailable");
        return location;
    }
}
