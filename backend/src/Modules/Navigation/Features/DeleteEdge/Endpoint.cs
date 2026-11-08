using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

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
        .RequirePermission(Permissions.MapWrite)
        .Audited("map.edge_deleted", "EDGE", "id")
        .WithName("DeleteEdge")
        .WithSummary("Delete an Edge (Lane) from a draft map version")
        .WithDescription("Removes an Edge from its MapVersion. Only allowed when the MapVersion is DRAFT; other map versions are not affected.");
    }
}
