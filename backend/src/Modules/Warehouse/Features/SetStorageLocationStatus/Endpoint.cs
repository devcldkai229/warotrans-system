using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Warehouse.Features.SetStorageLocationStatus;

public static class SetStorageLocationStatusEndpoint
{
    public static RouteGroupBuilder MapSetStorageLocationStatus(this RouteGroupBuilder group)
    {
        group.MapPost("/storage-locations/{id:guid}/status", async (
            Guid id,
            SetStorageLocationStatusRequest request,
            SetStorageLocationStatusHandler handler,
            CancellationToken cancellationToken) =>
            Results.Ok(await handler.HandleAsync(id, request, cancellationToken)))
        .RequirePermission(Permissions.WarehouseWrite)
        .Audited("storage_location.status_changed", "STORAGE_LOCATION", "id")
        .WithName("SetStorageLocationStatus")
        .WithSummary("Activate or deactivate a storage location")
        .WithDescription("A location that still holds Containers cannot be deactivated.");

        return group;
    }
}
