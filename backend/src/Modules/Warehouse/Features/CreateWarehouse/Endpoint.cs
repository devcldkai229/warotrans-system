using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.CreateWarehouse;

public static class CreateWarehouseEndpoint
{
    public static RouteGroupBuilder MapCreateWarehouse(this RouteGroupBuilder group)
    {
        group.MapPost("/warehouses", async (
            CreateWarehouseRequest request,
            CreateWarehouseHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(request, cancellationToken);
            return Results.Created($"/api/warehouse/warehouses/{response.Id}", response);
        })
        .WithName("CreateWarehouse")
        .WithSummary("Create a warehouse")
        .WithDescription("Creates a warehouse master record used by Facility maps, Fleet, and Transport Requests.")
        .RequireAuthorization(AuthorizationPolicies.AdminOnly);

        return group;
    }
}
