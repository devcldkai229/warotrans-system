using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.GetActiveMapVersion;

public static class GetActiveMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/warehouses/{warehouseId:guid}/active-map", async (
            Guid warehouseId,
            GetActiveMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(warehouseId, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetActiveMapVersion")
        .WithSummary("Get active published map version for a warehouse")
        .WithDescription("Retrieves the currently PUBLISHED active map version for real-time visualization and navigation.");
    }
}
