using System.Diagnostics;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;
using Xunit.Abstractions;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>Lightweight compile/route benchmark (~2k directed edges). Trait: Benchmark.</summary>
public sealed class TrafficGraphBenchmarkTests(ITestOutputHelper output)
{
    [Fact]
    [Trait("Category", "Benchmark")]
    public void Compile_and_shortest_path_on_grid_graph()
    {
        const int cols = 32;
        const int rows = 32;
        var edges = new List<RouteGraphEdgeInput>();
        var endpoints = new List<RouteGraphEndpointInput>
        {
            new("EP-SW", 0, 0, true),
            new("EP-NE", cols - 1, rows - 1, true)
        };

        for (var y = 0; y < rows; y++)
        {
            for (var x = 0; x < cols; x++)
            {
                if (x + 1 < cols)
                {
                    edges.Add(new RouteGraphEdgeInput(
                        $"E-H-{x}-{y}",
                        [new RoutePoint(x, y), new RoutePoint(x + 1, y)],
                        EdgeDirection.BIDIRECTIONAL,
                        null,
                        true));
                }

                if (y + 1 < rows)
                {
                    edges.Add(new RouteGraphEdgeInput(
                        $"E-V-{x}-{y}",
                        [new RoutePoint(x, y), new RoutePoint(x, y + 1)],
                        EdgeDirection.BIDIRECTIONAL,
                        null,
                        true));
                }
            }
        }

        var input = new TrafficCompileInput(
            "MAP-BENCH",
            "map",
            edges,
            endpoints,
            [],
            edges.Select(e => new TrafficLaneMeta(e.Code, WidthMeters: 1.0, Capacity: 1, e.Direction)).ToList(),
            [],
            TrafficFootprintOptions.Default);

        var sw = Stopwatch.StartNew();
        var a = TrafficGraphCompiler.Compile(input);
        var compileMs = sw.Elapsed.TotalMilliseconds;
        sw.Restart();
        var b = TrafficGraphCompiler.Compile(input);
        var compile2Ms = sw.Elapsed.TotalMilliseconds;

        Assert.Equal(a.Graph.GraphHash, b.Graph.GraphHash);
        Assert.Equal(a.Graph.Edges.Length, b.Graph.Edges.Length);
        Assert.True(a.Graph.Edges.Length >= 1500, $"expected ~2k directed edges, got {a.Graph.Edges.Length}");

        var start = a.Graph.Stations.First(s => s.EndpointCode == "EP-SW").NodeId;
        var goal = a.Graph.Stations.First(s => s.EndpointCode == "EP-NE").NodeId;
        sw.Restart();
        var path = a.Graph.ShortestPath(start, goal);
        var routeMs = sw.Elapsed.TotalMilliseconds;

        Assert.NotNull(path);
        Assert.NotEmpty(path!);

        output.WriteLine(
            $"edges={a.Graph.Edges.Length} compile={compileMs:F1}ms compile2={compile2Ms:F1}ms route={routeMs:F2}ms pathLen={path!.Count}");
    }
}
