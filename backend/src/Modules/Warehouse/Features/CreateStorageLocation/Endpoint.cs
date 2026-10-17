using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.CreateStorageLocation;

public static class CreateStorageLocationEndpoint
{
    public static RouteGroupBuilder MapCreateStorageLocation(this RouteGroupBuilder group)
    {
        group.MapPost("/storage-locations", async (
            CreateStorageLocationRequest request,
            CreateStorageLocationHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/warehouse/storage-locations/{response.Id}", response);
        })
        .WithName("CreateStorageLocation")
        .WithSummary("Create a storage location")
        .WithDescription("A named place that points at one enabled Endpoint of the warehouse's published map. The code is unique per warehouse.")
        .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}
