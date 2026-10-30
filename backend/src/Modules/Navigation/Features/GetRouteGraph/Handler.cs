using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Navigation.Features.GetRouteGraph;

/// <summary>
/// Builds the Nav2 Route Server graph of a map version via <see cref="TrafficGraphCompiler"/>
/// (stable ids + graphHash). Generated per call / cache; not stored in DB.
/// </summary>
public sealed class GetRouteGraphHandler(TrafficGraphCompileService compileService)
{
    public async Task<RouteGraphExportResult> HandleAsync(Guid mapVersionId, CancellationToken cancellationToken = default)
    {
        // Topology export does not require occupancy (clearance warnings are for validation endpoint).
        var bundle = await compileService.CompileAsync(mapVersionId, TrafficGraphCompileService.RuntimeIncludesOccupancy, cancellationToken);
        var result = bundle.Result;
        var routeIssues = result.Issues
            .Where(i => i.Code is not (
                TrafficGraphCompiler.OccupancyMissing or
                TrafficGraphCompiler.InsufficientClearance or
                TrafficGraphCompiler.TurnClearance))
            .Select(i => new RouteGraphIssue(
                i.Code,
                i.Severity == TrafficIssueSeverity.Error ? RouteGraphIssueSeverity.Error : RouteGraphIssueSeverity.Warning,
                i.Message,
                i.RelatedCodes))
            .ToList();

        // Prefer route-topology errors from the underlying builder codes.
        var topologyCodes = new HashSet<string>(StringComparer.Ordinal)
        {
            RouteGraphBuilder.GraphEmpty,
            RouteGraphBuilder.EndpointTooFar,
            RouteGraphBuilder.EndpointUnreachable,
            RouteGraphBuilder.EndpointInKeepOut,
            RouteGraphBuilder.DeadEndNode,
            RouteGraphBuilder.LaneInKeepOut,
            TrafficGraphCompiler.LegacyJunctionZone,
            TrafficGraphCompiler.FrameMismatch
        };
        routeIssues = routeIssues.Where(i => topologyCodes.Contains(i.Code) ||
                                             i.Code.StartsWith("ENDPOINT_", StringComparison.Ordinal) ||
                                             i.Code.StartsWith("GRAPH_", StringComparison.Ordinal) ||
                                             i.Code.StartsWith("DEAD_", StringComparison.Ordinal) ||
                                             i.Code.StartsWith("LANE_", StringComparison.Ordinal) ||
                                             i.Code.StartsWith("LEGACY_", StringComparison.Ordinal) ||
                                             i.Code.StartsWith("FRAME_", StringComparison.Ordinal))
            .ToList();

        return new RouteGraphExportResult(
            new RouteGraphResult(result.Graph.RouteGraph, routeIssues),
            result.Graph.GraphHash);
    }
}

public sealed record RouteGraphExportResult(RouteGraphResult Result, string GraphHash)
{
    public bool HasErrors => Result.HasErrors;
}
