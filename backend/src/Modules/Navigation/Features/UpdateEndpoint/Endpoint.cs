using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.UpdateEndpoint;

public static class UpdateEndpointEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPut("/endpoints/{id:guid}", async (
            Guid id,
            UpdateEndpointRequest request,
            UpdateEndpointHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("UpdateEndpoint")
        .WithSummary("Update an Endpoint on a draft map version")
        .WithDescription("Updates name, type, pose and tolerances of an Endpoint. Only allowed when its MapVersion is DRAFT. The Endpoint code is not changed.");
    }
}
