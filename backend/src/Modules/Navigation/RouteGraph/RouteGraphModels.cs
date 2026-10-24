using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.RouteGraph;

/// <summary>A point in the map frame (metres).</summary>
public readonly record struct RoutePoint(double X, double Y);

/// <summary>A drawn Edge: a polyline (lane centre line) with a travel direction.</summary>
public sealed record RouteGraphEdgeInput(
    string Code,
    IReadOnlyList<RoutePoint> Points,
    EdgeDirection Direction,
    double? MaxSpeed,
    bool IsActive);

/// <summary>An Endpoint (stop) that must become a node of the route graph.</summary>
public sealed record RouteGraphEndpointInput(string Code, double X, double Y, bool IsEnabled);

/// <summary>A Zone polygon (closed ring, map metres) applied to the lane segments inside it.</summary>
/// <param name="MaxSpeed">Required for SPEED zones (m/s).</param>
public sealed record RouteGraphZoneInput(
    string Code,
    ZoneType ZoneType,
    IReadOnlyList<RoutePoint> Ring,
    double? MaxSpeed,
    bool IsActive);

public sealed record RouteGraphInput(
    string Name,
    string FrameId,
    IReadOnlyList<RouteGraphEdgeInput> Edges,
    IReadOnlyList<RouteGraphEndpointInput> Endpoints,
    IReadOnlyList<RouteGraphZoneInput>? Zones = null);

/// <param name="VertexSnapTolerance">Points closer than this (m) are one node; a node this close to a segment splits it.</param>
/// <param name="EndpointSnapDistance">An Endpoint at most this far (m) from a lane is joined to it by a connector.</param>
/// <param name="JunctionCaptureDistance">A lane end this far (m) outside a junction zone (SINGLE_OCCUPANCY / NO_STOP)
/// still counts as reaching it (hand-drawn lanes stop a little short of the zone edge).</param>
public sealed record RouteGraphOptions(
    double VertexSnapTolerance = 0.05,
    double EndpointSnapDistance = 0.5,
    double JunctionCaptureDistance = 0.15)
{
    public static RouteGraphOptions Default { get; } = new();
}

public sealed record RouteGraphNode(int Id, double X, double Y, IReadOnlyList<string> EndpointCodes);

/// <summary>A directed straight segment StartId → EndId (Nav2 Route Server edge).</summary>
/// <param name="EdgeCodes">Codes of the drawn Edges this segment comes from (empty for a connector).</param>
/// <param name="AbsSpeedLimit">Lowest of the Edges' MaxSpeed and the MaxSpeed of SPEED zones the segment lies in (m/s).</param>
/// <param name="IsConnector">Short link added between a lane and an Endpoint that is not on it.</param>
/// <param name="ZoneCodes">SPEED / NO_STOP / SINGLE_OCCUPANCY zones the segment lies in.</param>
/// <param name="NoStop">Inside a NO_STOP zone (label only: multi-robot coordination is not implemented).</param>
/// <param name="SingleOccupancy">Inside a SINGLE_OCCUPANCY zone (label only).</param>
/// <param name="IsJunction">Link generated inside a SINGLE_OCCUPANCY / NO_STOP zone between lanes that end at it.</param>
public sealed record RouteGraphEdge(
    int Id,
    int StartId,
    int EndId,
    IReadOnlyList<string> EdgeCodes,
    double? AbsSpeedLimit,
    bool IsConnector,
    IReadOnlyList<string> ZoneCodes,
    bool NoStop,
    bool SingleOccupancy,
    bool IsJunction = false);

public sealed record RouteGraph(
    string Name,
    string FrameId,
    IReadOnlyList<RouteGraphNode> Nodes,
    IReadOnlyList<RouteGraphEdge> Edges);

public enum RouteGraphIssueSeverity
{
    Error,
    Warning
}

/// <param name="Code">ENDPOINT_TOO_FAR, ENDPOINT_UNREACHABLE, ENDPOINT_IN_KEEP_OUT, GRAPH_EMPTY (errors);
/// DEAD_END_NODE, LANE_IN_KEEP_OUT (warnings).</param>
/// <param name="RelatedCodes">Endpoint / Edge codes the issue is about.</param>
public sealed record RouteGraphIssue(
    string Code,
    RouteGraphIssueSeverity Severity,
    string Message,
    IReadOnlyList<string> RelatedCodes);

public sealed record RouteGraphResult(RouteGraph Graph, IReadOnlyList<RouteGraphIssue> Issues)
{
    public bool HasErrors => Issues.Any(i => i.Severity == RouteGraphIssueSeverity.Error);
}

/// <summary>
/// Extension point for extra rules on the finished graph (e.g. penalties). The ZoneTypes themselves are applied by
/// <see cref="RouteGraphBuilder"/> from <see cref="RouteGraphInput.Zones"/>; no extra rule is registered yet.
/// </summary>
public interface IRouteGraphZoneRule
{
    RouteGraph Apply(RouteGraph graph, ICollection<RouteGraphIssue> issues);
}
