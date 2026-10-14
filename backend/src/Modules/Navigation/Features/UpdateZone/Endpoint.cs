using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.UpdateZone;

public static class UpdateZoneEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPut("/zones/{id:guid}", async (
            Guid id,
            UpdateZoneRequest request,
            UpdateZoneHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("UpdateZone")
        .WithSummary("Update a zone on a draft map")
        .WithDescription("Updates Zone geometry and traffic policy. DRAFT maps only.");
    }
}
