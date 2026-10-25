using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace WaroTrans.Navigation.Features.GetTrafficGraphValidation;

public static class GetTrafficGraphValidationEndpoint
{
    public static void Map(IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/maps/{id:guid}/traffic-graph/validation", async (
            Guid id,
            GetTrafficGraphValidationHandler handler,
            CancellationToken cancellationToken) =>
        {
            var report = await handler.HandleAsync(id, cancellationToken);
            return Results.Ok(new
            {
                mapVersionId = report.MapVersionId,
                graphHash = report.GraphHash,
                isValid = report.IsValid,
                nodeCount = report.NodeCount,
                edgeCount = report.EdgeCount,
                resourceCount = report.ResourceCount,
                corridorCount = report.CorridorCount,
                holdingPointCount = report.HoldingPointCount,
                stoplineCount = report.StoplineCount,
                stationCount = report.StationCount,
                issues = report.Issues.Select(i => new
                {
                    code = i.Code,
                    severity = i.Severity.ToString().ToUpperInvariant(),
                    message = i.Message,
                    relatedCodes = i.RelatedCodes
                })
            });
        })
        .WithName("GetTrafficGraphValidation")
        .WithSummary("Validate compiled traffic graph (clearance, reachability, corridors)")
        .WithDescription(
            "Compiles CompiledTrafficGraph (with occupancy when available) and returns a validation report. " +
            "200 with isValid + issues; 404 map_version_not_found.");
    }
}
