using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.UpdateEdge;

public static class UpdateEdgeEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPut("/edges/{id:guid}", async (
            Guid id,
            UpdateEdgeRequest request,
            UpdateEdgeHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("UpdateEdge")
        .WithSummary("Update an Edge (Lane) on a draft map version")
        .WithDescription("Updates name, geometry, direction, max speed and active flag of an Edge. Only allowed when its MapVersion is DRAFT. The Edge code is not changed.");
    }
}
