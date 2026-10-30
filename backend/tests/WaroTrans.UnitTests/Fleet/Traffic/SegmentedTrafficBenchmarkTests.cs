using System.Diagnostics;
using WaroTrans.Fleet.Traffic;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

public class SegmentedTrafficBenchmarkTests
{
    [Fact]
    [Trait("Category", "Benchmark")]
    public void Benchmark_grid_acquire_and_route_latencies()
    {
        var results = new List<string>();
        foreach (var size in new[] { 32, 64 })
        {
            var graph = BuildGrid(size);
            foreach (var robotCount in new[] { 10, 25, 50 })
            {
                var sim = new FakeRobotSim(graph);
                var robots = Enumerable.Range(0, robotCount).Select(_ => Guid.NewGuid()).ToArray();
                var goal = graph.Stations[^1].NodeId;
                var acquireSamples = new List<long>(robotCount);
                var routeSamples = new List<long>(robotCount);

                var beforeAlloc = GC.GetAllocatedBytesForCurrentThread();
                var swTotal = Stopwatch.StartNew();
                for (var i = 0; i < robotCount; i++)
                {
                    var x = i % size;
                    var y = i / size;
                    var sw = Stopwatch.StartNew();
                    var plan = sim.Plan(robots[i], x, y, goal);
                    sw.Stop();
                    routeSamples.Add(sw.ElapsedTicks);

                    sw.Restart();
                    if (plan.Ok && plan.Segments.Length > 0)
                    {
                        sim.State.AcquireAtomic(plan.Segments[0] with { RequestId = Guid.NewGuid() }, sim.Epoch, null);
                    }

                    sw.Stop();
                    acquireSamples.Add(sw.ElapsedTicks);
                }

                swTotal.Stop();
                var allocated = GC.GetAllocatedBytesForCurrentThread() - beforeAlloc;
                var ws = Process.GetCurrentProcess().WorkingSet64;

                results.Add(
                    $"grid={size}x{size} robots={robotCount} " +
                    $"route_p50={Ms(Percentile(routeSamples, 0.50)):F3}ms " +
                    $"route_p95={Ms(Percentile(routeSamples, 0.95)):F3}ms " +
                    $"route_p99={Ms(Percentile(routeSamples, 0.99)):F3}ms " +
                    $"acq_p50={Ms(Percentile(acquireSamples, 0.50)):F3}ms " +
                    $"acq_p95={Ms(Percentile(acquireSamples, 0.95)):F3}ms " +
                    $"acq_p99={Ms(Percentile(acquireSamples, 0.99)):F3}ms " +
                    $"throughput={robotCount / swTotal.Elapsed.TotalSeconds:F1}/s " +
                    $"alloc={allocated}B ws={ws}");
            }
        }

        // Emit for IMPLEMENTATION-STATUS capture.
        Assert.All(results, r => Assert.False(string.IsNullOrWhiteSpace(r)));
        foreach (var line in results)
        {
            // xUnit output
            System.Console.WriteLine(line);
        }
    }

    private static double Ms(long ticks) => ticks * 1000.0 / Stopwatch.Frequency;

    private static long Percentile(List<long> samples, double p)
    {
        var sorted = samples.OrderBy(x => x).ToArray();
        if (sorted.Length == 0)
        {
            return 0;
        }

        var idx = (int)Math.Clamp(Math.Ceiling(p * sorted.Length) - 1, 0, sorted.Length - 1);
        return sorted[idx];
    }

    private static CompiledTrafficGraph BuildGrid(int n)
    {
        var edges = new List<RouteGraphEdgeInput>();
        var endpoints = new List<RouteGraphEndpointInput>();
        for (var y = 0; y < n; y++)
        {
            for (var x = 0; x < n; x++)
            {
                if (x + 1 < n)
                {
                    edges.Add(new($"H-{x}-{y}",
                        [new RoutePoint(x, y), new RoutePoint(x + 1, y)],
                        EdgeDirection.BIDIRECTIONAL, null, true));
                }

                if (y + 1 < n)
                {
                    edges.Add(new($"V-{x}-{y}",
                        [new RoutePoint(x, y), new RoutePoint(x, y + 1)],
                        EdgeDirection.BIDIRECTIONAL, null, true));
                }
            }
        }

        endpoints.Add(new("EP-START", 0, 0, true));
        endpoints.Add(new("EP-GOAL", n - 1, n - 1, true));

        var input = new TrafficCompileInput(
            $"GRID-{n}",
            "map",
            edges,
            endpoints,
            [],
            edges.Select(e => new TrafficLaneMeta(e.Code, 1.0, e.Direction)).ToList(),
            [],
            TrafficFootprintOptions.Default);
        return TrafficGraphCompiler.Compile(input).Graph;
    }
}
