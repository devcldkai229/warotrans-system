using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.GetMapVersion;

public static class GetMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/warehouses/{warehouseId:guid}/maps", async (
            Guid warehouseId,
            GetMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByWarehouseIdAsync(warehouseId, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetWarehouseMapVersions")
        .WithSummary("Get all map versions for a warehouse")
        .WithDescription("Retrieves the list of all map versions associated with a warehouse, ordered by VersionNo descending.");

        endpoints.MapGet("/maps/{id:guid}", async (
            Guid id,
            GetMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByIdAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetMapVersionById")
        .WithSummary("Get map version by ID")
        .WithDescription("Retrieves details of a specific map version by its ID.");
    }
}
