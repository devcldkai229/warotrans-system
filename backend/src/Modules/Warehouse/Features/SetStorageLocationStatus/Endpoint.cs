using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

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
        .WithName("SetStorageLocationStatus")
        .WithSummary("Activate or deactivate a storage location")
        .WithDescription("A location that still holds Containers cannot be deactivated.")
        .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}
