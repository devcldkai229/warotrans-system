using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.PublishMapVersion;

public static class PublishMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/maps/{id:guid}/publish", async (
            Guid id,
            PublishMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("PublishMapVersion")
        .WithSummary("Publish a draft map version")
        .WithDescription("Publishes a DRAFT map version for the warehouse, archiving any previously active published map version.");
    }
}
