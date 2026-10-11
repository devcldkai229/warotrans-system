using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.GetEdge;

public static class GetEdgeEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{mapVersionId:guid}/edges", async (
            Guid mapVersionId,
            GetEdgeHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByMapVersionIdAsync(mapVersionId, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetMapVersionEdges")
        .WithSummary("Get all Edges (Lanes) of a map version")
        .WithDescription("Retrieves every Edge drawn on the specified MapVersion, ordered by Code.");

        endpoints.MapGet("/edges/{id:guid}", async (
            Guid id,
            GetEdgeHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByIdAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetEdgeById")
        .WithSummary("Get Edge (Lane) by ID")
        .WithDescription("Retrieves details of a specific navigation Edge by its ID.");
    }
}
