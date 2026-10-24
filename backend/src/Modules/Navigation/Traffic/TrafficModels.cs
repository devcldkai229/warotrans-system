using System.Collections.Frozen;
using System.Collections.Immutable;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using RouteGraphModel = WaroTrans.Navigation.RouteGraph.RouteGraph;

namespace WaroTrans.Navigation.Traffic;

/// <summary>
/// Robot footprint used for clearance and swept-corridor checks.
/// Defaults match Nav2 footprint 0.32×0.26 m + 0.02 m padding (chassis in geometry.yaml / calibration).
/// Configured via <c>Traffic:Footprint</c>.
/// </summary>
public sealed class TrafficFootprintOptions
{
    public const string SectionName = "Traffic:Footprint";

    /// <summary>Robot length in metres (Nav2 footprint).</summary>
    public double LengthMeters { get; set; } = 0.32;

    /// <summary>Robot width in metres (Nav2 footprint).</summary>
    public double WidthMeters { get; set; } = 0.26;

    /// <summary>Inflation padding in metres.</summary>
    public double PaddingMeters { get; set; } = 0.02;

    /// <summary>Half width including padding — straight clearance (≥ 0.15 m).</summary>
    public double HalfWidth => (WidthMeters / 2.0) + PaddingMeters;

    /// <summary>Circumscribed turn radius including padding — in-place skid-steer turn (≥ ~0.226 m).</summary>
    public double TurnRadius =>
        Math.Sqrt(Square(LengthMeters / 2.0) + Square(WidthMeters / 2.0)) + PaddingMeters;

    public static TrafficFootprintOptions Default { get; } = new();

    private static double Square(double v) => v * v;
}

public enum TrafficIssueSeverity
{
    Error,
    Warning
}

public enum TrafficResourceKind
{
    Lane,
    Zone,
    JunctionConflict,
    CriticalCorridor
}

/// <param name="Code">Stable issue code (ENDPOINT_DISCONNECTED, …).</param>
public sealed record TrafficIssue(
    string Code,
    TrafficIssueSeverity Severity,
    string Message,
    IReadOnlyList<string> RelatedCodes);

public sealed record TrafficNode(
    int Id,
    double X,
    double Y,
    ImmutableArray<string> EndpointCodes,
    bool IsHoldingPoint,
    bool IsStation);

public sealed record TrafficEdge(
    int Id,
    int StartId,
    int EndId,
    ImmutableArray<string> EdgeCodes,
    double? AbsSpeedLimit,
    bool IsConnector,
    ImmutableArray<string> ZoneCodes,
    bool NoStop,
    bool SingleOccupancy,
    bool IsJunction,
    double LengthMeters,
    bool InCriticalCorridor);

public sealed record TrafficResource(
    string Id,
    TrafficResourceKind Kind,
    int Capacity,
    ImmutableArray<int> EdgeIds,
    ImmutableArray<string> RelatedCodes);

public sealed record TrafficCorridor(
    int Id,
    string ResourceId,
    ImmutableArray<int> EdgeIds,
    ImmutableArray<int> EntryNodeIds);

public sealed record TrafficStopline(
    int NodeId,
    int CorridorId,
    int EntryEdgeId);

public sealed record TrafficStation(
    string EndpointCode,
    int NodeId,
    int? AccessEdgeId,
    bool IsServiceStop,
    bool IsRecovery);

/// <summary>
/// Immutable compiled traffic graph: topology (shared ids with Nav2 route-graph GeoJSON) plus
/// in-memory resources, holding/stoplines, stations, CSR adjacency. Not persisted.
/// </summary>
public sealed class CompiledTrafficGraph
{
    private readonly FrozenDictionary<int, int> _nodeIndexById;

    public CompiledTrafficGraph(
        string name,
        string frameId,
        string graphHash,
        ImmutableArray<TrafficNode> nodes,
        ImmutableArray<TrafficEdge> edges,
        ImmutableArray<TrafficResource> resources,
        ImmutableArray<TrafficCorridor> corridors,
        ImmutableArray<TrafficStopline> stoplines,
        ImmutableArray<TrafficStation> stations,
        ImmutableArray<TrafficIssue> compileIssues,
        ImmutableArray<int> csrOffsets,
        ImmutableArray<int> csrEdgeIds,
        TrafficFootprintOptions footprint,
        RouteGraphModel routeGraph,
        SweptConflictIndex? sweptConflicts = null)
    {
        Name = name;
        FrameId = frameId;
        GraphHash = graphHash;
        Nodes = nodes;
        Edges = edges;
        Resources = resources;
        Corridors = corridors;
        Stoplines = stoplines;
        Stations = stations;
        CompileIssues = compileIssues;
        CsrOffsets = csrOffsets;
        CsrEdgeIds = csrEdgeIds;
        Footprint = footprint;
        RouteGraph = routeGraph;
        SweptConflicts = sweptConflicts;
        NodeById = nodes.ToFrozenDictionary(n => n.Id);
        EdgeById = edges.ToFrozenDictionary(e => e.Id);
        _nodeIndexById = Enumerable.Range(0, nodes.Length).ToFrozenDictionary(i => nodes[i].Id, i => i);
    }

    public string Name { get; }
    public string FrameId { get; }
    public string GraphHash { get; }
    public ImmutableArray<TrafficNode> Nodes { get; }
    public ImmutableArray<TrafficEdge> Edges { get; }
    public ImmutableArray<TrafficResource> Resources { get; }
    public ImmutableArray<TrafficCorridor> Corridors { get; }
    public ImmutableArray<TrafficStopline> Stoplines { get; }
    public ImmutableArray<TrafficStation> Stations { get; }
    public ImmutableArray<TrafficIssue> CompileIssues { get; }
    public ImmutableArray<int> CsrOffsets { get; }
    public ImmutableArray<int> CsrEdgeIds { get; }
    public TrafficFootprintOptions Footprint { get; }
    public RouteGraphModel RouteGraph { get; }
    public SweptConflictIndex? SweptConflicts { get; }
    public FrozenDictionary<int, TrafficNode> NodeById { get; }
    public FrozenDictionary<int, TrafficEdge> EdgeById { get; }

    public IEnumerable<(int EdgeId, TrafficEdge Edge)> Outgoing(int nodeId)
    {
        if (!_nodeIndexById.TryGetValue(nodeId, out var index))
        {
            yield break;
        }

        var start = CsrOffsets[index];
        var end = CsrOffsets[index + 1];
        for (var i = start; i < end; i++)
        {
            var edgeId = CsrEdgeIds[i];
            yield return (edgeId, EdgeById[edgeId]);
        }
    }

    /// <summary>
    /// Shortest path (sum of lengths) from <paramref name="startNodeId"/> to <paramref name="goalNodeId"/>.
    /// Deterministic tie-break: prefer the smaller edge id when distances are equal.
    /// </summary>
    public IReadOnlyList<int>? ShortestPath(int startNodeId, int goalNodeId)
    {
        if (!_nodeIndexById.ContainsKey(startNodeId) || !_nodeIndexById.ContainsKey(goalNodeId))
        {
            return null;
        }

        if (startNodeId == goalNodeId)
        {
            return [];
        }

        var dist = new Dictionary<int, double>();
        var prev = new Dictionary<int, (int NodeId, int EdgeId)>();
        var open = new SortedSet<(double Dist, int EdgeId, int NodeId)>(
            Comparer<(double Dist, int EdgeId, int NodeId)>.Create((a, b) =>
            {
                var c = a.Dist.CompareTo(b.Dist);
                if (c != 0) return c;
                c = a.EdgeId.CompareTo(b.EdgeId);
                if (c != 0) return c;
                return a.NodeId.CompareTo(b.NodeId);
            }));

        dist[startNodeId] = 0;
        open.Add((0, 0, startNodeId));

        while (open.Count > 0)
        {
            var (d, _, u) = open.Min;
            open.Remove(open.Min);
            if (u == goalNodeId)
            {
                break;
            }

            if (d > dist.GetValueOrDefault(u, double.PositiveInfinity))
            {
                continue;
            }

            foreach (var (edgeId, edge) in Outgoing(u))
            {
                var nd = d + edge.LengthMeters;
                if (!dist.TryGetValue(edge.EndId, out var known) || nd < known - 1e-12 ||
                    (Math.Abs(nd - known) <= 1e-12 &&
                     (!prev.TryGetValue(edge.EndId, out var p) || edgeId < p.EdgeId)))
                {
                    dist[edge.EndId] = nd;
                    prev[edge.EndId] = (u, edgeId);
                    open.Add((nd, edgeId, edge.EndId));
                }
            }
        }

        if (!prev.ContainsKey(goalNodeId) && startNodeId != goalNodeId)
        {
            return null;
        }

        var path = new List<int>();
        for (var cur = goalNodeId; cur != startNodeId; cur = prev[cur].NodeId)
        {
            path.Add(prev[cur].EdgeId);
        }

        path.Reverse();
        return path;
    }

    public bool CanReach(int fromNodeId, int toNodeId) => ShortestPath(fromNodeId, toNodeId) is not null;
}

/// <summary>Per drawn-Edge metadata not carried by <see cref="RouteGraphEdgeInput"/>.</summary>
public sealed record TrafficLaneMeta(string Code, double WidthMeters, int Capacity, EdgeDirection Direction);

/// <summary>Per Zone capacity for in-memory resources.</summary>
public sealed record TrafficZoneMeta(string Code, ZoneType ZoneType, int Capacity);

/// <summary>Input to <see cref="TrafficGraphCompiler"/>.</summary>
public sealed record TrafficCompileInput(
    string Name,
    string FrameId,
    IReadOnlyList<RouteGraphEdgeInput> Edges,
    IReadOnlyList<RouteGraphEndpointInput> Endpoints,
    IReadOnlyList<RouteGraphZoneInput> Zones,
    IReadOnlyList<TrafficLaneMeta> LaneMeta,
    IReadOnlyList<TrafficZoneMeta> ZoneMeta,
    TrafficFootprintOptions Footprint,
    OccupancyGrid? Occupancy = null,
    IReadOnlySet<string>? ServiceStopEndpointCodes = null,
    IReadOnlySet<string>? RecoveryEndpointCodes = null,
    string ExpectedFrameId = "map");

public sealed record TrafficCompileResult(
    CompiledTrafficGraph Graph,
    IReadOnlyList<TrafficIssue> Issues)
{
    public bool HasErrors => Issues.Any(i => i.Severity == TrafficIssueSeverity.Error);
}

public sealed record TrafficValidationReport(
    Guid MapVersionId,
    string GraphHash,
    bool IsValid,
    IReadOnlyList<TrafficIssue> Issues,
    int NodeCount,
    int EdgeCount,
    int ResourceCount,
    int CorridorCount,
    int HoldingPointCount,
    int StoplineCount,
    int StationCount);
