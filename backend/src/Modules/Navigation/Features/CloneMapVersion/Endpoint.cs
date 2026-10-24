using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.CloneMapVersion;

public static class CloneMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/maps/{id:guid}/clone", async (
            Guid id,
            CloneMapVersionRequest? request,
            CloneMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request ?? new CloneMapVersionRequest(null), cancellationToken);
            return Results.Created($"/api/navigation/maps/{response.Id}", response);
        })
        .WithName("CloneMapVersion")
        .WithSummary("Copy a map version into a new editable DRAFT")
        .WithDescription(
            "Creates a DRAFT of the same warehouse with the source's occupancy image and a copy of its endpoints, zones, " +
            "edges and endpoint groups. Ids are new and codes come from the system code generator (endpoint EP-{NAME}, " +
            "zone ZONE-{NAME}, edge EDGE-nnn). " +
            "When the DRAFT is published, storage locations bound to the copied endpoints move to the new ones.");
    }
}
