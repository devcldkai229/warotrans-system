using System.Collections.Immutable;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Annotates a granted edge list with executable Forward / Reverse / Spin steps
/// for the <em>chosen</em> path (not every unused portal pair).
/// ContinuousArc is executed as Forward (kink + rotate_to_heading) — no arc grant geometry in v10.
/// </summary>
public static class ManeuverStepBuilder
{
    public static ImmutableArray<TrafficManeuverStep> Build(
        CompiledTrafficGraph graph,
        IReadOnlyList<int> edgeIds,
        TrafficManeuverOptions? options = null)
    {
        options ??= TrafficManeuverOptions.Default;
        if (edgeIds.Count == 0)
        {
            return [];
        }

        var steps = new List<TrafficManeuverStep>();
        var forwardBuf = new List<int>();

        void FlushForward()
        {
            if (forwardBuf.Count == 0 || !options.ForwardEnabled)
            {
                forwardBuf.Clear();
                return;
            }

            steps.Add(new TrafficManeuverStep(
                TrafficManeuverKind.Forward,
                forwardBuf.ToImmutableArray()));
            forwardBuf.Clear();
        }

        forwardBuf.Add(edgeIds[0]);

        for (var i = 0; i < edgeIds.Count - 1; i++)
        {
            var inEdge = graph.EdgeById[edgeIds[i]];
            var outEdge = graph.EdgeById[edgeIds[i + 1]];
            var nodeId = inEdge.EndId;
            if (outEdge.StartId != nodeId)
            {
                forwardBuf.Add(edgeIds[i + 1]);
                continue;
            }

            var node = graph.NodeById[nodeId];
            var isStation = node.IsStation || graph.Stations.Any(s => s.NodeId == nodeId);
            if (!isStation)
            {
                forwardBuf.Add(edgeIds[i + 1]);
                continue;
            }

            var approach = Heading(graph, inEdge);
            var leave = Heading(graph, outEdge);
            var yaw = 0.0;
            var reverse =
                outEdge.EndId == inEdge.StartId ||
                StationManeuverClassifier.IsYawDriveInReverseOut(approach, leave, yaw);

            if (reverse)
            {
                FlushForward();
                if (options.ReverseEnabled)
                {
                    steps.Add(new TrafficManeuverStep(
                        TrafficManeuverKind.Reverse,
                        ImmutableArray.Create(outEdge.Id)));
                }
                else
                {
                    forwardBuf.Add(outEdge.Id);
                }

                continue;
            }

            // TruePivot stations (compile-time RequiresSpin): insert Spin before leave edge.
            // ContinuousArc / Forward kink stations stay in the Forward buffer.
            if (node.RequiresSpin && options.SpinEnabled)
            {
                FlushForward();
                var resources = graph.ResourcesCovering([inEdge.Id, outEdge.Id])
                    .Concat([$"node:{nodeId}"])
                    .Distinct(StringComparer.Ordinal)
                    .ToImmutableArray();
                steps.Add(new TrafficManeuverStep(
                    TrafficManeuverKind.Spin,
                    ImmutableArray<int>.Empty,
                    leave,
                    resources));
            }

            forwardBuf.Add(outEdge.Id);
        }

        FlushForward();

        if (steps.Count == 0 && edgeIds.Count > 0 && options.ForwardEnabled)
        {
            steps.Add(new TrafficManeuverStep(TrafficManeuverKind.Forward, edgeIds.ToImmutableArray()));
        }

        return steps.ToImmutableArray();
    }

    private static double Heading(CompiledTrafficGraph graph, TrafficEdge edge)
    {
        var a = graph.NodeById[edge.StartId];
        var b = graph.NodeById[edge.EndId];
        return Math.Atan2(b.Y - a.Y, b.X - a.X);
    }

    public static List<ManeuverStepPayload> ToPayload(IReadOnlyList<TrafficManeuverStep> steps) =>
        steps.Select(s => new ManeuverStepPayload
        {
            Kind = s.Kind.ToString(),
            EdgeIds = s.EdgeIds.ToList(),
            YawTarget = s.YawTargetRad,
            ResourceIds = s.ResourceIds?.ToList()
        }).ToList();
}
