using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.DeleteEndpoint;

public static class DeleteEndpointEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapDelete("/endpoints/{id:guid}", async (
            Guid id,
            DeleteEndpointHandler handler,
            CancellationToken cancellationToken) =>
        {
            await handler.HandleAsync(id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteEndpoint")
        .WithSummary("Delete an Endpoint from a draft map version")
        .WithDescription(
            "Removes an Endpoint from its MapVersion. Only allowed when the MapVersion is DRAFT. " +
            "Returns 409 endpoint_in_use when the Endpoint is still referenced (e.g. EndpointGroup).");
    }
}
