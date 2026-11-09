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
    ImmutableArray<SemanticZonePoly> NoStopZones,
    /// <summary>KEEP_OUT rings from keepout.json — plans that sweep these are rejected.</summary>
    ImmutableArray<SemanticZonePoly> KeepoutZones = default,
    /// <summary>How far the robot may drift sideways off its proposed path and stay inside what it reserved.</summary>
    double PathToleranceMeters = 0.15,
    /// <summary>See <see cref="TrafficOptions.SemanticLaneHalfWidthMeters"/>. 0: discs only.</summary>
    double LaneHalfWidthMeters = 0)
{
    /// <summary>Circumscribed radius of the (padded) footprint: covers the robot at any heading, so turning in place.</summary>
    public double FootprintRadiusMeters =>
        Math.Sqrt(FootprintHalfLength * FootprintHalfLength + FootprintHalfWidth * FootprintHalfWidth);

    public double EffectiveCellSize => Math.Max(0.1, CellSizeMeters);

    /// <summary>Spacing of the samples taken along a path: consecutive samples are at most this far apart.</summary>
    public double SampleStepMeters => EffectiveCellSize / 4.0;

    /// <summary>
    /// Disc radius reserved around every path sample: footprint + path tolerance + half a sample step, so the
    /// footprint anywhere between two samples (at any heading, up to the tolerance off the path) is covered.
    /// </summary>
    public double ReserveRadiusMeters =>
        FootprintRadiusMeters + Math.Max(0, PathToleranceMeters) + SampleStepMeters / 2.0;
}

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
    int Priority = 0,
    /// <summary>Robot-computed hash of the proposed path, echoed in the grant so the robot knows which plan it covers.</summary>
    string? PlanHash = null,
    /// <summary>The backend NAVIGATE this plan executes; the grant is tied to it.</summary>
    Guid? CommandId = null);

/// <summary>
/// Pure geometry for zone + swept-cell resources (no IO). The robot gateway (semantic_traffic_client.py) runs the
/// same arithmetic to know which cells a grant covers; both sides are checked against semantic_cells_vectors.json.
/// </summary>
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

    /// <summary>A disc touches a polygon: its centre is inside, or an edge passes within the radius.</summary>
    public static bool DiscHitsZone(double x, double y, double radius, ImmutableArray<(double X, double Y)> ring)
    {
        if (PointInRing(x, y, ring))
        {
            return true;
        }

        for (int i = 0, j = ring.Length - 1; i < ring.Length; j = i++)
        {
            if (PointToSegmentDistance(x, y, ring[j].X, ring[j].Y, ring[i].X, ring[i].Y) <= radius)
            {
                return true;
            }
        }

        return false;
    }

    public static string CellId(int ix, int iy) => string.Create(CultureInfo.InvariantCulture, $"cell:{ix}:{iy}");

    /// <summary>Every grid cell the disc touches (exact: distance from the centre to the cell square ≤ radius).</summary>
    public static void DiscCells(double x, double y, double radius, double cellSize, HashSet<string> into)
    {
        var ix0 = (int)Math.Floor((x - radius) / cellSize);
        var ix1 = (int)Math.Floor((x + radius) / cellSize);
        var iy0 = (int)Math.Floor((y - radius) / cellSize);
        var iy1 = (int)Math.Floor((y + radius) / cellSize);
        for (var ix = ix0; ix <= ix1; ix++)
        {
            for (var iy = iy0; iy <= iy1; iy++)
            {
                var dx = Math.Max(Math.Max(ix * cellSize - x, 0), x - (ix + 1) * cellSize);
                var dy = Math.Max(Math.Max(iy * cellSize - y, 0), y - (iy + 1) * cellSize);
                if (dx * dx + dy * dy <= radius * radius)
                {
                    into.Add(CellId(ix, iy));
                }
            }
        }
    }

    /// <summary>
    /// Points along the path at most <paramref name="step"/> apart, until the travelled distance passes the horizon.
    /// </summary>
    public static List<(double X, double Y)> SamplePath(ImmutableArray<SemanticPlanPose> poses, double step, double horizon)
    {
        var samples = new List<(double X, double Y)>();
        if (poses.IsDefaultOrEmpty)
        {
            return samples;
        }

        samples.Add((poses[0].X, poses[0].Y));
        var traveled = 0.0;
        for (var i = 1; i < poses.Length && traveled <= horizon; i++)
        {
            var (ax, ay) = (poses[i - 1].X, poses[i - 1].Y);
            var (bx, by) = (poses[i].X, poses[i].Y);
            var len = Math.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
            if (len <= 0)
            {
                continue;
            }

            var n = (int)Math.Ceiling(len / step);
            for (var k = 1; k <= n; k++)
            {
                var t = (double)k / n;
                samples.Add((ax + (bx - ax) * t, ay + (by - ay) * t));
            }

            traveled += len;
        }

        return samples;
    }

    /// <summary>Zones and cells the robot sweeps along the first <c>HorizonMeters</c> of its proposed path.</summary>
    public static ImmutableArray<string> CollectResources(
        SemanticTrafficPolicy policy,
        ImmutableArray<SemanticPlanPose> poses)
    {
        if (poses.IsDefaultOrEmpty)
        {
            return [];
        }

        var horizon = Math.Max(policy.EffectiveCellSize, policy.HorizonMeters);
        var resources = new HashSet<string>(StringComparer.Ordinal);
        foreach (var sample in SweptSamples(policy, poses, horizon))
        {
            resources.UnionWith(sample.Resources);
        }

        return resources.OrderBy(x => x, StringComparer.Ordinal).ToImmutableArray();
    }

    /// <summary>Every path sample with what is reserved around it: the unit <see cref="CollectResources"/> adds up.</summary>
    public static List<(double X, double Y, HashSet<string> Resources)> SweptSamples(
        SemanticTrafficPolicy policy,
        ImmutableArray<SemanticPlanPose> poses,
        double horizon)
    {
        var samples = SamplePath(poses, policy.SampleStepMeters, horizon);
        var reachedEnd = samples.Count > 0
                         && samples[^1].X == poses[^1].X && samples[^1].Y == poses[^1].Y;
        var swept = new List<(double, double, HashSet<string>)>(samples.Count);
        for (var i = 0; i < samples.Count; i++)
        {
            var (x, y) = samples[i];
            var resources = new HashSet<string>(StringComparer.Ordinal);
            foreach (var z in policy.SingleOccupancyZones)
            {
                if (DiscHitsZone(x, y, policy.ReserveRadiusMeters, z.Ring))
                {
                    resources.Add($"zone:{z.Code}");
                }
            }

            if (policy.LaneHalfWidthMeters > 0 && StraightHeadingAt(policy, samples, i, poses, reachedEnd) is { } heading)
            {
                RectCells(
                    x, y, heading,
                    policy.FootprintHalfLength + Math.Max(0, policy.PathToleranceMeters) + policy.SampleStepMeters / 2.0,
                    policy.LaneHalfWidthMeters,
                    policy.EffectiveCellSize, resources);
            }
            else
            {
                DiscCells(x, y, policy.ReserveRadiusMeters, policy.EffectiveCellSize, resources);
            }

            swept.Add((x, y, resources));
        }

        return swept;
    }

    private const double StraightWindowMeters = 0.25;
    private static readonly double StraightMaxTurnRad = 15.0 * Math.PI / 180.0;

    private static double AngleBetween(double a, double b) => Math.Abs(Math.Atan2(Math.Sin(a - b), Math.Cos(a - b)));

    /// <summary>
    /// The heading of the path at this sample, or null where the robot may turn on the spot and needs a disc: near a
    /// corner, at a start whose pose does not face along the path, at the goal when it has to turn to the final yaw.
    /// </summary>
    private static double? StraightHeadingAt(
        SemanticTrafficPolicy policy,
        List<(double X, double Y)> samples,
        int i,
        ImmutableArray<SemanticPlanPose> poses,
        bool reachedEnd)
    {
        var n = samples.Count;
        if (n < 2)
        {
            return null;
        }

        var k = (int)Math.Ceiling(StraightWindowMeters / policy.SampleStepMeters);
        var before = samples[Math.Max(0, i - k)];
        var after = samples[Math.Min(n - 1, i + k)];
        var here = samples[i];
        double? incoming = i > 0 ? Math.Atan2(here.Y - before.Y, here.X - before.X) : null;
        double? outgoing = i < n - 1 ? Math.Atan2(after.Y - here.Y, after.X - here.X) : null;
        if (incoming is { } a && outgoing is { } b && AngleBetween(a, b) > StraightMaxTurnRad)
        {
            return null;
        }

        var heading = (outgoing ?? incoming)!.Value;
        if (i <= k && AngleBetween(poses[0].Yaw, heading) > StraightMaxTurnRad)
        {
            return null;
        }

        if (reachedEnd && i >= n - 1 - k && AngleBetween(poses[^1].Yaw, heading) > StraightMaxTurnRad)
        {
            return null;
        }

        return heading;
    }

    /// <summary>Every grid cell an oriented rectangle overlaps (separating axes: the grid's two and the rectangle's two).</summary>
    public static void RectCells(
        double x, double y, double heading, double halfLength, double halfWidth, double cellSize, HashSet<string> into)
    {
        var c = Math.Cos(heading);
        var s = Math.Sin(heading);
        var extentX = Math.Abs(c) * halfLength + Math.Abs(s) * halfWidth;
        var extentY = Math.Abs(s) * halfLength + Math.Abs(c) * halfWidth;
        var half = cellSize / 2.0;
        var cellAlong = half * (Math.Abs(c) + Math.Abs(s));
        for (var ix = (int)Math.Floor((x - extentX) / cellSize); ix <= (int)Math.Floor((x + extentX) / cellSize); ix++)
        {
            for (var iy = (int)Math.Floor((y - extentY) / cellSize); iy <= (int)Math.Floor((y + extentY) / cellSize); iy++)
            {
                var dx = (ix + 0.5) * cellSize - x;
                var dy = (iy + 0.5) * cellSize - y;
                if (Math.Abs(dx * c + dy * s) <= halfLength + cellAlong && Math.Abs(-dx * s + dy * c) <= halfWidth + cellAlong)
                {
                    into.Add(CellId(ix, iy));
                }
            }
        }
    }

    /// <summary>What a whole proposed path needs, beyond the grant horizon: where another robot must not stop and wait.</summary>
    public static HashSet<string> WholePathResources(SemanticTrafficPolicy policy, ImmutableArray<SemanticPlanPose> poses)
    {
        var resources = new HashSet<string>(StringComparer.Ordinal);
        if (!poses.IsDefaultOrEmpty)
        {
            foreach (var sample in SweptSamples(policy, poses, double.PositiveInfinity))
            {
                resources.UnionWith(sample.Resources);
            }
        }

        return resources;
    }

    /// <summary>
    /// A robot held at this sample may stop here: it ends up within the reserve radius of it, which must touch no
    /// NO_STOP zone and no single-occupancy zone it was not already in (waiting inside one would block it for nothing).
    /// </summary>
    public static bool MayWaitAt(SemanticTrafficPolicy policy, double x, double y, IReadOnlySet<string> zonesAtStart)
    {
        var radius = policy.ReserveRadiusMeters;
        if (!policy.NoStopZones.IsDefaultOrEmpty && policy.NoStopZones.Any(z => DiscHitsZone(x, y, radius, z.Ring)))
        {
            return false;
        }

        return policy.SingleOccupancyZones.IsDefaultOrEmpty
               || policy.SingleOccupancyZones.All(z =>
                   zonesAtStart.Contains($"zone:{z.Code}") || !DiscHitsZone(x, y, radius, z.Ring));
    }

    /// <summary>
    /// True when the body certainly overlaps a KEEP_OUT ring somewhere along the full proposed path, whatever its
    /// heading: the path centre comes within half the body width of the ring. This is the backstop, not the margin.
    /// The planner keeps its distance through the inflated planning mask (0.25 m, more than the footprint radius);
    /// the gap between the two lets a localization offset of some centimetres through. Rejecting at the footprint
    /// radius would refuse every replan the moment the robot's own pose drifted past that mask edge, and strand it.
    /// </summary>
    public static bool PlanHitsKeepout(
        SemanticTrafficPolicy policy,
        ImmutableArray<SemanticPlanPose> poses)
    {
        if (poses.IsDefaultOrEmpty || policy.KeepoutZones.IsDefaultOrEmpty)
        {
            return false;
        }

        var radius = Math.Min(policy.FootprintHalfLength, policy.FootprintHalfWidth);
        var horizon = double.PositiveInfinity; // check whole plan, not just grant horizon
        foreach (var (x, y) in SamplePath(poses, policy.SampleStepMeters, horizon))
        {
            foreach (var z in policy.KeepoutZones)
            {
                if (DiscHitsZone(x, y, radius, z.Ring))
                {
                    return true;
                }
            }
        }

        return false;
    }

    /// <summary>
    /// The robot footprint (any heading) grown by <paramref name="margin"/> no longer touches any of the resources.
    /// Unknown ids and station bays are never clear here (fail closed).
    /// </summary>
    public static bool IsPhysicallyClearOfResources(
        SemanticTrafficPolicy policy,
        double x, double y,
        IEnumerable<string> resourceIds,
        double margin)
    {
        var radius = policy.FootprintRadiusMeters + Math.Max(0, margin);
        HashSet<string>? under = null;
        foreach (var rid in resourceIds)
        {
            if (rid.StartsWith("zone:", StringComparison.Ordinal))
            {
                var code = rid["zone:".Length..];
                var rings = policy.SingleOccupancyZones.Where(z => z.Code == code).ToList();
                if (rings.Count == 0 || rings.Any(z => DiscHitsZone(x, y, radius, z.Ring)))
                {
                    return false;
                }
            }
            else if (rid.StartsWith("cell:", StringComparison.Ordinal))
            {
                if (under is null)
                {
                    under = new HashSet<string>(StringComparer.Ordinal);
                    DiscCells(x, y, radius, policy.EffectiveCellSize, under);
                }

                if (under.Contains(rid))
                {
                    return false;
                }
            }
            else
            {
                return false;
            }
        }

        return true;
    }

    public static double PointToSegmentDistance(double px, double py, double ax, double ay, double bx, double by)
    {
        var vx = bx - ax;
        var vy = by - ay;
        var c2 = vx * vx + vy * vy;
        var t = c2 <= 0 ? 0 : Math.Clamp((vx * (px - ax) + vy * (py - ay)) / c2, 0, 1);
        var ex = px - (ax + t * vx);
        var ey = py - (ay + t * vy);
        return Math.Sqrt(ex * ex + ey * ey);
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

        var keepoutPath = Path.Combine(mapDir, "keepout.json");
        var zones = LoadZones(singlePath);
        var noStop = LoadZones(noStopPath);
        var keepout = LoadZones(keepoutPath);
        return new SemanticTrafficPolicy(
            fp,
            mapVersionId,
            mapVersionCode,
            CellSizeMeters: 0.5,
            HorizonMeters: 4.0,
            FootprintHalfLength: 0.18,
            FootprintHalfWidth: 0.15,
            zones,
            noStop,
            keepout);
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
