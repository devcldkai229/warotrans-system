using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.GetZone;

public static class GetZoneEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/zones/{id:guid}", async (
            Guid id,
            GetZoneHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleByIdAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("GetZoneById")
        .WithSummary("Get a zone by id");

        endpoints.MapGet("/maps/{mapVersionId:guid}/zones", async (
            Guid mapVersionId,
            GetZoneHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleByMapAsync(mapVersionId, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("ListZonesByMap")
        .WithSummary("List zones for a map version");
    }
}
