using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.DeleteZone;

public static class DeleteZoneEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapDelete("/zones/{id:guid}", async (
            Guid id,
            DeleteZoneHandler handler,
            CancellationToken cancellationToken) =>
        {
            await handler.HandleAsync(id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteZone")
        .WithSummary("Delete a zone from a draft map")
        .WithDescription("Deletes a Zone. DRAFT maps only.");
    }
}
