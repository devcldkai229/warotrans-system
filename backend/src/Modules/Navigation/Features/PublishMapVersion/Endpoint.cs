using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

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
        .RequirePermission(Permissions.MapWrite)
        .Audited("map.published", "MAP", "id")
        .WithName("PublishMapVersion")
        .WithSummary("Publish a draft map version")
        .WithDescription("Publishes a DRAFT map version for the warehouse, archiving any previously active published map version.");
    }
}
