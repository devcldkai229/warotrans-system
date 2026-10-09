using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.GetEndpoint;

public static class GetEndpointEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{mapVersionId:guid}/endpoints", async (
            Guid mapVersionId,
            GetEndpointHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByMapVersionIdAsync(mapVersionId, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetMapVersionEndpoints")
        .WithSummary("Get all Endpoints of a map version")
        .WithDescription("Retrieves every Endpoint placed on the specified MapVersion, ordered by Code.");

        endpoints.MapGet("/endpoints/{id:guid}", async (
            Guid id,
            GetEndpointHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.GetByIdAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetEndpointById")
        .WithSummary("Get Endpoint by ID")
        .WithDescription("Retrieves details of a specific navigation Endpoint by its ID.");
    }
}
