using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.Navigation.RouteGraph;

namespace WaroTrans.Navigation.Features.GetRouteGraph;

public static class GetRouteGraphEndpoint
{
    public const string WarningsHeader = "X-Route-Graph-Warnings";

    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{id:guid}/route-graph", async (
            Guid id,
            GetRouteGraphHandler handler,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            var result = await handler.HandleAsync(id, cancellationToken);
            var issues = result.Issues.Select(i => new
            {
                code = i.Code,
                severity = i.Severity.ToString().ToUpperInvariant(),
                message = i.Message,
                relatedCodes = i.RelatedCodes
            }).ToList();

            if (result.HasErrors)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status422UnprocessableEntity,
                    title: "route_graph_invalid",
                    detail: "The Edges / Endpoints of this map do not form a usable route graph. Fix the listed issues in the Map Editor.",
                    instance: httpContext.Request.Path,
                    extensions: new Dictionary<string, object?>
                    {
                        ["code"] = "route_graph_invalid",
                        ["traceId"] = httpContext.TraceIdentifier,
                        ["issues"] = issues
                    });
            }

            var warnings = issues.Count(i => i.severity == "WARNING");
            if (warnings > 0)
            {
                httpContext.Response.Headers[WarningsHeader] = warnings.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }

            return Results.Text(RouteGraphGeoJsonWriter.Write(result.Graph), RouteGraphGeoJsonWriter.ContentType);
        })
        .WithName("GetRouteGraph")
        .WithSummary("Nav2 Route Server graph (GeoJSON) built from the map's Edges and Endpoints")
        .WithDescription(
            "Directed graph for nav2_route GeoJsonGraphFileLoader: lane polylines become straight directed segments " +
            "(BIDIRECTIONAL → both ways), Endpoints become nodes (joined by connectors when ≤ 0.5 m from a lane). " +
            "200 application/geo+json (header X-Route-Graph-Warnings when there are warnings); 422 route_graph_invalid " +
            "with the issues (ENDPOINT_TOO_FAR, ENDPOINT_UNREACHABLE, ENDPOINT_IN_KEEP_OUT, GRAPH_EMPTY); 404 map_version_not_found. " +
            "Zones: KEEP_OUT removes the lane pieces inside, SPEED lowers their abs_speed_limit; JUNCTION / SINGLE_OCCUPANCY / " +
            "NO_STOP link the lane ends that meet in them (and Endpoints within 0.5 m of them) and label the pieces inside.");
    }
}
