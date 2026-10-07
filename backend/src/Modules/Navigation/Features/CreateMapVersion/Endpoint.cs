using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.CreateMapVersion;

public static class CreateMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/warehouses/{warehouseId:guid}/maps", async (
            Guid warehouseId,
            CreateMapVersionRequest request,
            CreateMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(warehouseId, request, cancellationToken);
            return Results.Created($"/api/navigation/maps/{response.Id}", response);
        })
        .WithName("CreateMapVersion")
        .WithSummary("Create a new draft map version for a warehouse")
        .WithDescription("Creates a new MapVersion in DRAFT status with auto-incremented VersionNo for the specified warehouse.");
    }
}
