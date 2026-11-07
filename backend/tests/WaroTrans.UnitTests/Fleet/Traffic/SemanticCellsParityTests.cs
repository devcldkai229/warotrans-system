using System.Collections.Immutable;
using System.Text.Json;
using System.Text.Json.Nodes;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.UnitTests.Fleet.Traffic;

/// <summary>
/// The robot gateway (warotrans_fleet/semantic_traffic_client.py) recomputes the cells/zones of a grant to keep the
/// robot inside them. Both implementations are pinned to the same vectors: samples/traffic/semantic_cells_vectors.json
/// (copied to warotrans_fleet/test/data). Regenerate with WARO_WRITE_SEMANTIC_VECTORS=1 after a deliberate change.
/// </summary>
public class SemanticCellsParityTests
{
    private static readonly SemanticZonePoly[] Zones =
    [
        new("ZONE-A", ImmutableArray.Create((1.0, 0.3), (2.0, 0.3), (2.0, 1.2), (1.0, 1.2))),
        new("ZONE-B", ImmutableArray.Create((-2.0, -2.0), (-1.0, -2.0), (-1.5, -1.0)))
    ];

    private static readonly (string Name, double[][] Poses)[] Cases =
    [
        ("straight", [[0, 0, 0], [0.5, 0, 0], [1.0, 0, 0], [1.5, 0, 0]]),
        ("diagonal_sparse", [[0.13, -0.07, 0.7], [2.4, 1.9, 0.7]]),
        ("turn", [[0, 0, 0], [1, 0, 0], [1, 1, 1.57], [0, 1, 3.14]]),
        ("beyond_horizon", [[0, 0, 0], [2, 0, 0], [4.5, 0, 0], [9, 0, 0]]),
        ("zone_b_edge", [[-2.4, -1.4, 0], [-0.4, -1.4, 0]]),
        ("negative_quadrant", [[-0.6, -0.6, 3.1], [-1.23, -0.61, 3.1], [-1.9, -0.6, 3.1]]),
        ("single_pose", [[0.3, 0.3, 0]])
    ];

    private static SemanticTrafficPolicy Policy() => new TrafficOptions
    {
        SemanticCellSizeMeters = 0.25,
        SemanticHorizonMeters = 4.0,
        SemanticPathToleranceMeters = 0.15
    }.ApplySemanticOverrides(new SemanticTrafficPolicy("fp", Guid.Empty, "", 0, 0, 0, 0, [.. Zones], []));

    private static string VectorsPath()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "samples", "traffic", "semantic_cells_vectors.json");
            if (Directory.Exists(Path.Combine(dir.FullName, "samples")))
            {
                return candidate;
            }
        }

        throw new DirectoryNotFoundException("samples/ not found above the test binaries");
    }

    private static JsonObject Generate()
    {
        var policy = Policy();
        var cases = new JsonArray();
        foreach (var (name, poses) in Cases)
        {
            var path = poses.Select(p => new SemanticPlanPose(p[0], p[1], p[2])).ToImmutableArray();
            cases.Add(new JsonObject
            {
                ["name"] = name,
                ["poses"] = JsonSerializer.SerializeToNode(poses),
                ["resources"] = JsonSerializer.SerializeToNode(SemanticReservation.CollectResources(policy, path).ToArray())
            });
        }

        var footprints = new JsonArray();
        foreach (var (x, y) in new[] { (0.0, 0.0), (1.1, 0.1), (-1.5, -1.2), (0.249, -0.001) })
        {
            var under = new HashSet<string>(StringComparer.Ordinal);
            var radius = policy.FootprintRadiusMeters + 0.05;
            SemanticReservation.DiscCells(x, y, radius, policy.EffectiveCellSize, under);
            foreach (var z in policy.SingleOccupancyZones.Where(z => SemanticReservation.DiscHitsZone(x, y, radius, z.Ring)))
            {
                under.Add($"zone:{z.Code}");
            }

            footprints.Add(new JsonObject
            {
                ["x"] = x,
                ["y"] = y,
                ["radius"] = radius,
                ["resources"] = JsonSerializer.SerializeToNode(under.Order(StringComparer.Ordinal).ToArray())
            });
        }

        return new JsonObject
        {
            ["geometry"] = new JsonObject
            {
                ["cellSizeMeters"] = policy.EffectiveCellSize,
                ["horizonMeters"] = Math.Max(policy.EffectiveCellSize, policy.HorizonMeters),
                ["sampleStepMeters"] = policy.SampleStepMeters,
                ["reserveRadiusMeters"] = policy.ReserveRadiusMeters,
                ["footprintRadiusMeters"] = policy.FootprintRadiusMeters
            },
            ["zones"] = JsonSerializer.SerializeToNode(Zones.Select(z => new
            {
                code = z.Code,
                rings = new[] { z.Ring.Select(p => new[] { p.X, p.Y }).ToArray() }
            }).ToArray()),
            ["cases"] = cases,
            ["footprints"] = footprints
        };
    }

    [Fact]
    public void Backend_cells_match_the_shared_vectors()
    {
        var path = VectorsPath();
        var generated = Generate();
        if (Environment.GetEnvironmentVariable("WARO_WRITE_SEMANTIC_VECTORS") == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, generated.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }

        var stored = JsonNode.Parse(File.ReadAllText(path))!;
        Assert.Equal(stored["cases"]!.ToJsonString(), generated["cases"]!.ToJsonString());
        Assert.Equal(stored["footprints"]!.ToJsonString(), generated["footprints"]!.ToJsonString());
        Assert.Equal(stored["geometry"]!.ToJsonString(), generated["geometry"]!.ToJsonString());
    }
}
