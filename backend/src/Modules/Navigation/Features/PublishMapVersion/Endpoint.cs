using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.Navigation.Features.PublishMapVersion;

/// <summary>Force: publish over overridable BLOCKs of the publish check; Reason is then required (audited, logged).</summary>
public sealed record PublishMapVersionRequest(bool Force = false, string? Reason = null);

public static class PublishMapVersionEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{id:guid}/publish-check", async (
            Guid id,
            MapPublishCheck check,
            CancellationToken cancellationToken) => Results.Ok(await check.CheckAsync(id, cancellationToken)))
        .RequirePermission(Permissions.MapWrite)
        .WithName("CheckMapVersionPublish")
        .WithDescription("What publishing this map version would break or change: workflows naming places it lacks (BLOCK), Jobs running on the current map (BLOCK, not overridable), requests and Jobs that will move to it, robots on the old map.");

        endpoints.MapPost("/maps/{id:guid}/publish", async (
            Guid id,
            PublishMapVersionRequest? request,
            PublishMapVersionHandler handler,
            CancellationToken cancellationToken) =>
        {
            var response = await handler.HandleAsync(id, cancellationToken, request?.Force ?? false, request?.Reason);
            return Results.Ok(response);
        })
        .RequirePermission(Permissions.MapWrite)
        .Audited("map.published", "MAP", "id")
        .WithName("PublishMapVersion")
        .WithSummary("Publish a draft map version")
        .WithDescription("Publishes a DRAFT map version for the warehouse, archiving any previously active published map version.");
    }
}
