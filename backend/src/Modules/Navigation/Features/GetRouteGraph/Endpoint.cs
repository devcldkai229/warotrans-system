using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.Navigation.RouteGraph;

namespace WaroTrans.Navigation.Features.GetRouteGraph;

public static class GetRouteGraphEndpoint
{
    public const string WarningsHeader = "X-Route-Graph-Warnings";
    public const string GraphHashHeader = "X-Route-Graph-Hash";

    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{id:guid}/route-graph", async (
            Guid id,
            GetRouteGraphHandler handler,
            HttpContext httpContext,
            CancellationToken cancellationToken) =>
        {
            var export = await handler.HandleAsync(id, cancellationToken);
            var result = export.Result;
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
                        ["graphHash"] = export.GraphHash,
                        ["issues"] = issues
                    });
            }

            var warnings = issues.Count(i => i.severity == "WARNING");
            if (warnings > 0)
            {
                httpContext.Response.Headers[WarningsHeader] = warnings.ToString(System.Globalization.CultureInfo.InvariantCulture);
            }

            httpContext.Response.Headers[GraphHashHeader] = export.GraphHash;
            return Results.Text(
                RouteGraphGeoJsonWriter.Write(result.Graph, export.GraphHash),
                RouteGraphGeoJsonWriter.ContentType);
        })
        .WithName("GetRouteGraph")
        .WithSummary("Nav2 Route Server graph (GeoJSON) built from the map's Edges and Endpoints")
        .WithDescription(
            "Directed graph for nav2_route GeoJsonGraphFileLoader via CompiledTrafficGraph: lane polylines become " +
            "straight directed segments (BIDIRECTIONAL → both ways), Endpoints become nodes. Response includes " +
            "properties.graphHash and header X-Route-Graph-Hash. 200 application/geo+json; 422 route_graph_invalid; " +
            "404 map_version_not_found. Zones: KEEP_OUT removes lane pieces; JUNCTION / SINGLE_OCCUPANCY / NO_STOP connect branches.");
    }
}
