using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>Helpers for resolving MOVE start/goal nodes on a compiled traffic graph.</summary>
public static class TrafficGraphQueries
{
    /// <summary>Nearest graph node by Euclidean distance (ties → smaller node id).</summary>
    public static int? FindNearestNodeId(CompiledTrafficGraph graph, double x, double y)
    {
        ArgumentNullException.ThrowIfNull(graph);
        if (graph.Nodes.Length == 0)
        {
            return null;
        }

        int? bestId = null;
        var bestDist = double.PositiveInfinity;
        foreach (var node in graph.Nodes)
        {
            var dx = node.X - x;
            var dy = node.Y - y;
            var d = dx * dx + dy * dy;
            if (d < bestDist - 1e-12 || (Math.Abs(d - bestDist) <= 1e-12 && (bestId is null || node.Id < bestId)))
            {
                bestDist = d;
                bestId = node.Id;
            }
        }

        return bestId;
    }

    /// <summary>Station node for an endpoint code, else nearest node to the pose.</summary>
    public static int? ResolveEndpointNodeId(CompiledTrafficGraph graph, string endpointCode, double x, double y)
    {
        ArgumentNullException.ThrowIfNull(graph);
        foreach (var station in graph.Stations)
        {
            if (string.Equals(station.EndpointCode, endpointCode, StringComparison.Ordinal))
            {
                return station.NodeId;
            }
        }

        return FindNearestNodeId(graph, x, y);
    }
}
