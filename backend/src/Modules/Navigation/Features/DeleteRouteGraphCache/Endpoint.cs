using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.DeleteRouteGraphCache;

public static class DeleteRouteGraphCacheEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapDelete("/maps/{id:guid}/route-graph-cache", async (
            Guid id,
            DeleteRouteGraphCacheHandler handler,
            CancellationToken cancellationToken) =>
        {
            await handler.HandleAsync(id, cancellationToken);
            return Results.NoContent();
        })
        .WithName("DeleteRouteGraphCache")
        .WithSummary("Clear in-memory compiled route/traffic graph cache for a map")
        .WithDescription(
            "Removes Cached CompiledTrafficGraph entries for this MapVersionId. " +
            "Does not delete Edges, Endpoints, or Zones; the next GET route-graph or traffic validation rebuilds. " +
            "204; 404 map_version_not_found.");
    }
}
