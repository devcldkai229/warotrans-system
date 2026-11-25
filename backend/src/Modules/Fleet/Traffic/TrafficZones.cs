using System.Collections.Immutable;
using System.Text.Json;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// What a traffic zone is for, in the zone-chain resource model (<see cref="TrafficOptions.SemanticResourceModel"/>).
/// The map is cut into zones; a robot holds every zone its path runs through, so two robots never meet head-on in a
/// corridor or both drive into one dead end.
/// </summary>
public enum TrafficZoneKind
{
    /// <summary>A place with work at its endpoints (shelf bay, INBOUND, OUTBOUND). One robot at a time; it has queue points.</summary>
    Bay,

    /// <summary>A corridor or crossing. One robot at a time, and no robot stops in it.</summary>
    Transit,

    /// <summary>An open room around stop slots (parking, charger, queue, inspection). One robot drives in it at a time.</summary>
    Yard,

    /// <summary>A stop slot around one endpoint (parking, charger, queue point, inspection). The robot standing there holds it.</summary>
    Slot
}

/// <summary>One zone of the partition, read from the bundle's <c>traffic_zones.json</c>.</summary>
public sealed record TrafficZone(
    string Code,
    TrafficZoneKind Kind,
    ImmutableArray<(double X, double Y)> Ring,
    /// <summary>Where a robot sent into this zone waits while another robot is in it, in order of preference.</summary>
    ImmutableArray<string> QueueEndpointCodes,
    /// <summary>The endpoints inside the zone (informative; membership is geometric).</summary>
    ImmutableArray<string> EndpointCodes,
    /// <summary>
    /// Where a robot waits for this zone on the lane leading into it (x, y, yaw; no endpoint): MAP-ONE-V022's right
    /// column (INBOUND + corridor + OUTBOUND, one robot) is waited for on lane LTR, before its edge.
    /// </summary>
    ImmutableArray<(double X, double Y, double Yaw)> HoldPoses = default)
{
    /// <summary>A robot may stand still here: a bay it works at or a stop slot.</summary>
    public bool IsStop => Kind is TrafficZoneKind.Bay or TrafficZoneKind.Slot;

    public string ResourceId => TrafficZones.ResourceIdOf(Code);

    /// <summary>Order in which overlapping zones claim a point: a slot drawn on top of a yard wins.</summary>
    public int Precedence => Kind switch
    {
        TrafficZoneKind.Slot => 0,
        TrafficZoneKind.Bay => 1,
        _ => 2
    };

    public double Area
    {
        get
        {
            var a = 0.0;
            for (int i = 0, j = Ring.Length - 1; i < Ring.Length; j = i++)
            {
                a += (Ring[j].X + Ring[i].X) * (Ring[j].Y - Ring[i].Y);
            }

            return Math.Abs(a / 2.0);
        }
    }
}

/// <summary>Pure helpers of the zone-chain model (no IO except reading the bundle file).</summary>
public static class TrafficZones
{
    public const string FileName = "traffic_zones.json";

    /// <summary>Traffic zones share the <c>zone:</c> resource prefix with single-occupancy zones (capacity 1).</summary>
    public static string ResourceIdOf(string code) => $"zone:{code}";

    /// <summary>
    /// The zone that owns the point: zones are checked by precedence (slot, bay, then corridors and yards) and, among
    /// equals, smallest first, so a slot drawn inside a yard owns its area. Null: the point is in no zone.
    /// </summary>
    public static TrafficZone? ZoneAt(ImmutableArray<TrafficZone> zones, double x, double y)
    {
        if (zones.IsDefaultOrEmpty)
        {
            return null;
        }

        TrafficZone? best = null;
        foreach (var z in zones)
        {
            if (!SemanticReservation.PointInRing(x, y, z.Ring))
            {
                continue;
            }

            if (best is null || z.Precedence < best.Precedence || (z.Precedence == best.Precedence && z.Area < best.Area))
            {
                best = z;
            }
        }

        return best;
    }

    public static TrafficZone? Find(ImmutableArray<TrafficZone> zones, string resourceOrCode)
    {
        if (zones.IsDefaultOrEmpty)
        {
            return null;
        }

        var code = resourceOrCode.StartsWith("zone:", StringComparison.Ordinal) ? resourceOrCode["zone:".Length..] : resourceOrCode;
        foreach (var z in zones)
        {
            if (string.Equals(z.Code, code, StringComparison.Ordinal))
            {
                return z;
            }
        }

        return null;
    }

    /// <summary>
    /// Reads <c>traffic_zones.json</c>: <c>{"zones":[{"code","kind","rings":[[[x,y],...]],"queueEndpointCodes":[...],
    /// "endpointCodes":[...]}]}</c>. A missing file is an empty partition (the cell model is used).
    /// </summary>
    public static ImmutableArray<TrafficZone> Load(string path)
    {
        if (!File.Exists(path))
        {
            return [];
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        return Parse(doc.RootElement);
    }

    public static ImmutableArray<TrafficZone> Parse(JsonElement root)
    {
        if (!root.TryGetProperty("zones", out var arr) || arr.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var list = new List<TrafficZone>();
        foreach (var z in arr.EnumerateArray())
        {
            var code = z.TryGetProperty("code", out var c) ? c.GetString()?.Trim() ?? "" : "";
            var kindText = z.TryGetProperty("kind", out var k) ? k.GetString() ?? "" : "";
            if (string.IsNullOrWhiteSpace(code) || !Enum.TryParse<TrafficZoneKind>(kindText, ignoreCase: true, out var kind))
            {
                continue;
            }

            var queues = Strings(z, "queueEndpointCodes");
            if (queues.IsEmpty && z.TryGetProperty("queueEndpointCode", out var single) && single.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(single.GetString()))
            {
                queues = [single.GetString()!.Trim()];
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
                    if (p.ValueKind == JsonValueKind.Array && p.GetArrayLength() >= 2)
                    {
                        pts.Add((p[0].GetDouble(), p[1].GetDouble()));
                    }
                }

                if (pts.Count >= 3)
                {
                    list.Add(new TrafficZone(code, kind, pts.ToImmutableArray(), queues, Strings(z, "endpointCodes"), Poses(z, "holdPoses")));
                }
            }
        }

        return list.ToImmutableArray();
    }

    private static ImmutableArray<(double X, double Y, double Yaw)> Poses(JsonElement z, string name) =>
        z.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.Array
            ? el.EnumerateArray()
                .Where(p => p.ValueKind == JsonValueKind.Array && p.GetArrayLength() >= 2)
                .Select(p => (p[0].GetDouble(), p[1].GetDouble(), p.GetArrayLength() >= 3 ? p[2].GetDouble() : 0.0))
                .ToImmutableArray()
            : [];

    private static ImmutableArray<string> Strings(JsonElement z, string name) =>
        z.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.Array
            ? el.EnumerateArray()
                .Where(e => e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString()))
                .Select(e => e.GetString()!.Trim())
                .ToImmutableArray()
            : [];
}
