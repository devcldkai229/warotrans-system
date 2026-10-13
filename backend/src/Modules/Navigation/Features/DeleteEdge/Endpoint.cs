using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.DeleteEdge;

public static class DeleteEdgeEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapDelete("/edges/{id:guid}", async (
            Guid id,
            DeleteEdgeHandler handler,
            CancellationToken cancellationToken) =>
        {
            await handler.HandleAsync(id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteEdge")
        .WithSummary("Delete an Edge (Lane) from a draft map version")
        .WithDescription("Removes an Edge from its MapVersion. Only allowed when the MapVersion is DRAFT; other map versions are not affected.");
    }
}
