using System.Collections.Immutable;
using System.Globalization;
using System.Text.Json;

namespace WaroTrans.Fleet.Traffic;

/// <summary>Read-only Stage-3 policy loaded from semantic map adapter artifacts (DB not required).</summary>
public sealed record SemanticTrafficPolicy(
    string SemanticMapFingerprint,
    Guid MapVersionId,
    string MapVersionCode,
    double CellSizeMeters,
    double HorizonMeters,
    double FootprintHalfLength,
    double FootprintHalfWidth,
    ImmutableArray<SemanticZonePoly> SingleOccupancyZones,
    ImmutableArray<SemanticZonePoly> NoStopZones);

public sealed record SemanticZonePoly(
    string Code,
    ImmutableArray<(double X, double Y)> Ring);

public sealed record SemanticPlanPose(double X, double Y, double Yaw);

public sealed record SemanticPlanProposeRequest(
    Guid RequestId,
    Guid RobotId,
    string RobotCode,
    string SemanticMapFingerprint,
    long PlanRevision,
    ImmutableArray<SemanticPlanPose> Poses,
    SemanticPlanPose? Goal,
    Guid? JobStepId,
    Guid? JobId,
    int Priority = 0);

/// <summary>Pure geometry helpers for zone + swept-cell resources (no IO).</summary>
public static class SemanticReservation
{
    public static bool PointInRing(double x, double y, ImmutableArray<(double X, double Y)> ring)
    {
        var n = ring.Length;
        if (n < 3)
        {
            return false;
        }

        var inside = false;
        for (int i = 0, j = n - 1; i < n; j = i++)
        {
            var (xi, yi) = ring[i];
            var (xj, yj) = ring[j];
            if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) is 0 ? 1e-15 : (yj - yi)) + xi))
            {
                inside = !inside;
            }
        }

        return inside;
    }

    public static bool FootprintHitsZone(
        double x, double y, double yaw,
        ImmutableArray<(double X, double Y)> ring,
        double halfL, double halfW)
    {
        var c = Math.Cos(yaw);
        var s = Math.Sin(yaw);
        ReadOnlySpan<(double Lx, double Ly)> corners =
        [
            (halfL, halfW), (halfL, -halfW), (-halfL, halfW), (-halfL, -halfW), (0, 0)
        ];
        foreach (var (lx, ly) in corners)
        {
            var wx = x + c * lx - s * ly;
            var wy = y + s * lx + c * ly;
            if (PointInRing(wx, wy, ring))
            {
                return true;
            }
        }

        return false;
    }

    public static ImmutableArray<string> CollectResources(
        SemanticTrafficPolicy policy,
        ImmutableArray<SemanticPlanPose> poses)
    {
        if (poses.IsDefaultOrEmpty || poses.Length == 0)
        {
            return [];
        }

        var cellSize = Math.Max(0.1, policy.CellSizeMeters);
        var horizon = Math.Max(cellSize, policy.HorizonMeters);
        var halfL = policy.FootprintHalfLength;
        var halfW = policy.FootprintHalfWidth;
        var resources = new HashSet<string>(StringComparer.Ordinal);
        var traveled = 0.0;

        for (var i = 0; i < poses.Length; i++)
        {
            var p = poses[i];
            if (i > 0)
            {
                var prev = poses[i - 1];
                var dx = p.X - prev.X;
                var dy = p.Y - prev.Y;
                traveled += Math.Sqrt(dx * dx + dy * dy);
                if (traveled > horizon)
                {
                    break;
                }
            }

            foreach (var z in policy.SingleOccupancyZones)
            {
                if (FootprintHitsZone(p.X, p.Y, p.Yaw, z.Ring, halfL, halfW))
                {
                    resources.Add($"zone:{z.Code}");
                }
            }

            // Swept corridor cells (exclusive capacity 1).
            SampleFootprintCells(p.X, p.Y, p.Yaw, halfL, halfW, cellSize, resources);
        }

        return resources.OrderBy(x => x, StringComparer.Ordinal).ToImmutableArray();
    }

    public static void SampleFootprintCells(
        double x, double y, double yaw,
        double halfL, double halfW,
        double cellSize,
        HashSet<string> into)
    {
        var c = Math.Cos(yaw);
        var s = Math.Sin(yaw);
        // Coarse sample of footprint AABB in map frame.
        for (var u = -halfL; u <= halfL + 1e-9; u += Math.Min(halfL, cellSize * 0.5))
        {
            for (var v = -halfW; v <= halfW + 1e-9; v += Math.Min(halfW, cellSize * 0.5))
            {
                var wx = x + c * u - s * v;
                var wy = y + s * u + c * v;
                var ix = (int)Math.Floor(wx / cellSize);
                var iy = (int)Math.Floor(wy / cellSize);
                into.Add(string.Create(CultureInfo.InvariantCulture, $"cell:{ix}:{iy}"));
            }
        }
    }

    public static bool IsPhysicallyClearOfResources(
        SemanticTrafficPolicy policy,
        double x, double y, double yaw,
        IEnumerable<string> resourceIds,
        double margin)
    {
        var halfL = policy.FootprintHalfLength + margin;
        var halfW = policy.FootprintHalfWidth + margin;
        var cellSize = Math.Max(0.1, policy.CellSizeMeters);
        foreach (var rid in resourceIds)
        {
            if (rid.StartsWith("zone:", StringComparison.Ordinal))
            {
                var code = rid["zone:".Length..];
                var zone = policy.SingleOccupancyZones.FirstOrDefault(z => z.Code == code);
                if (zone is null)
                {
                    return false; // uncertain → fail closed
                }

                if (FootprintHitsZone(x, y, yaw, zone.Ring, halfL, halfW))
                {
                    return false;
                }
            }
            else if (rid.StartsWith("cell:", StringComparison.Ordinal))
            {
                var held = new HashSet<string>(StringComparer.Ordinal);
                SampleFootprintCells(x, y, yaw, halfL, halfW, cellSize, held);
                if (held.Contains(rid))
                {
                    return false;
                }
            }
            else if (rid.StartsWith("bay:", StringComparison.Ordinal))
            {
                // Bay clearance is pose-based at station; keep held until explicit release.
                return false;
            }
        }

        return true;
    }

    /// <summary>The map version a semantic bundle was exported from (<c>semantic_manifest.json</c> mapVersionId).</summary>
    public static Guid? TryReadManifestMapVersionId(string mapDir)
    {
        var manifestPath = Path.Combine(mapDir, "semantic_manifest.json");
        if (!File.Exists(manifestPath))
        {
            return null;
        }

        using var manifestDoc = JsonDocument.Parse(File.ReadAllText(manifestPath));
        return manifestDoc.RootElement.TryGetProperty("mapVersionId", out var idEl)
               && idEl.ValueKind == JsonValueKind.String
               && Guid.TryParse(idEl.GetString(), out var id)
            ? id
            : null;
    }

    public static SemanticTrafficPolicy? TryLoadFromDirectory(string mapDir, Guid mapVersionId, string mapVersionCode)
    {
        var manifestPath = Path.Combine(mapDir, "semantic_manifest.json");
        var singlePath = Path.Combine(mapDir, "single_occupancy.json");
        var noStopPath = Path.Combine(mapDir, "no_stop.json");
        if (!File.Exists(manifestPath))
        {
            return null;
        }

        using var manifestDoc = JsonDocument.Parse(File.ReadAllText(manifestPath));
        var fp = manifestDoc.RootElement.TryGetProperty("semanticMapFingerprint", out var fpEl)
            ? fpEl.GetString() ?? ""
            : "";

        var zones = LoadZones(singlePath);
        var noStop = LoadZones(noStopPath);
        return new SemanticTrafficPolicy(
            fp,
            mapVersionId,
            mapVersionCode,
            CellSizeMeters: 0.5,
            HorizonMeters: 4.0,
            FootprintHalfLength: 0.18,
            FootprintHalfWidth: 0.15,
            zones,
            noStop);
    }

    private static ImmutableArray<SemanticZonePoly> LoadZones(string path)
    {
        if (!File.Exists(path))
        {
            return [];
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        if (!doc.RootElement.TryGetProperty("zones", out var arr) || arr.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var list = new List<SemanticZonePoly>();
        foreach (var z in arr.EnumerateArray())
        {
            var code = z.TryGetProperty("code", out var c) ? c.GetString() ?? "" : "";
            if (string.IsNullOrWhiteSpace(code))
            {
                continue;
            }

            if (!z.TryGetProperty("rings", out var rings) || rings.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var ringEl in rings.EnumerateArray())
            {
                var pts = new List<(double X, double Y)>();
                foreach (var p in ringEl.EnumerateArray())
                {
                    if (p.GetArrayLength() < 2)
                    {
                        continue;
                    }

                    pts.Add((p[0].GetDouble(), p[1].GetDouble()));
                }

                if (pts.Count >= 3)
                {
                    list.Add(new SemanticZonePoly(code, pts.ToImmutableArray()));
                }
            }
        }

        return list.ToImmutableArray();
    }
}
