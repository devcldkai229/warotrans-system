using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.CreateZone;

public static class CreateZoneEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/maps/{mapVersionId:guid}/zones", async (
            Guid mapVersionId,
            CreateZoneRequest request,
            CreateZoneHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(mapVersionId, request, cancellationToken);
            return Results.Created($"/api/navigation/zones/{response.Id}", response);
        })
        .WithName("CreateZone")
        .WithSummary("Create a zone on a draft map version")
        .WithDescription("Creates a traffic Zone with GeoJSON Polygon geometry in world meters. DRAFT maps only.");
    }
}
