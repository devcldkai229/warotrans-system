using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;

namespace WaroTrans.Warehouse.Features.GetProductInventoryContext;

public static class GetProductInventoryContextEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/products/{productId:guid}/inventory-context", async (
            Guid productId,
            GetProductInventoryContextHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(productId, cancellationToken);
            return Results.Ok(response);
        })
        .RequirePermission(Permissions.WarehouseRead)
        .WithName("GetProductInventoryContext")
        .WithSummary("Get Product storage and inventory context")
        .WithDescription("Retrieves the storage locations, stock counts, and container status breakdown for a product.");
    }
}
