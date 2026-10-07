using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.ArchiveMapVersion;

public static class ArchiveMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/maps/{id:guid}/archive", async (
            Guid id,
            ArchiveMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("ArchiveMapVersion")
        .WithSummary("Archive a map version")
        .WithDescription("Transitions any active or draft map version to ARCHIVED status.");
    }
}
