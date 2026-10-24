using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Navigation.Features.GetTrafficGraphDebugSvg;

public static class GetTrafficGraphDebugSvgEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{id:guid}/traffic-graph/debug.svg", async (
            Guid id,
            GetTrafficGraphDebugSvgHandler handler,
            CancellationToken cancellationToken) =>
        {
            var svg = await handler.HandleAsync(id, cancellationToken);
            return Results.Text(svg, TrafficDebugSvgWriter.ContentType);
        })
        .WithName("GetTrafficGraphDebugSvg")
        .WithSummary("SVG overlay of compiled traffic graph for debugging")
        .WithDescription(
            "Returns an SVG overlay of occupancy (sampled), zones, directed edges, holding points, stoplines, " +
            "and clearance issue highlights. 200 image/svg+xml; 404 map_version_not_found.");
    }
}
