using System.Text.Json;
using WaroTrans.Navigation.Enums;
using WaroTrans.Navigation.RouteGraph;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.UnitTests.Navigation.Traffic;

/// <summary>
/// Loads a read-only map snapshot folder (snapshot.json + map.pgm + map.yaml) into an in-memory
/// <see cref="TrafficCompileInput"/>. Never writes to the database.
/// </summary>
public static class MapSnapshotCompileHarness
{
    public static string ResolveSampleDir(string mapFolderName)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "samples", "maps", mapFolderName);
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(candidate, "snapshot.json")))
            {
                return candidate;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException(
            $"Could not locate samples/maps/{mapFolderName} walking up from {AppContext.BaseDirectory}.");
    }

    public static TrafficCompileInput Load(string mapFolderName, TrafficFootprintOptions? footprint = null)
    {
        var root = ResolveSampleDir(mapFolderName);
        var snapshotPath = Path.Combine(root, "snapshot.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(snapshotPath));
        var rootEl = doc.RootElement;

        var map = rootEl.TryGetProperty("mapVersion", out var mv) ? mv : rootEl.GetProperty("map_version");
        var code = map.TryGetProperty("code", out var c) ? c.GetString()! : mapFolderName;
        var frame = map.TryGetProperty("frame_id", out var f) ? f.GetString() ?? "map" : "map";
        var resolution = map.TryGetProperty("resolution", out var r) ? r.GetDouble() : 0.05;
        var originX = map.TryGetProperty("origin_x", out var ox) ? ox.GetDouble() : 0;
        var originY = map.TryGetProperty("origin_y", out var oy) ? oy.GetDouble() : 0;
        var negate = false;
        if (map.TryGetProperty("negate", out var neg))
        {
            negate = neg.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Number => neg.GetInt32() != 0,
                _ => false
            };
        }
        var occThresh = map.TryGetProperty("occupied_threshold", out var ot) ? ot.GetDouble() : 0.65;
        var freeThresh = map.TryGetProperty("free_threshold", out var ft) ? ft.GetDouble() : 0.25;

        // Prefer yaml beside PGM when present (authoritative ROS meta).
        var yamlPath = Directory.GetFiles(root, "*.yaml").FirstOrDefault()
                       ?? Directory.GetFiles(root, "*.yml").FirstOrDefault();
        if (yamlPath is not null)
        {
            foreach (var line in File.ReadAllLines(yamlPath))
            {
                var t = line.Trim();
                if (t.StartsWith("resolution:", StringComparison.Ordinal))
                {
                    resolution = double.Parse(t["resolution:".Length..].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                }
                else if (t.StartsWith("origin:", StringComparison.Ordinal))
                {
                    var inner = t["origin:".Length..].Trim().Trim('[', ']');
                    var parts = inner.Split(',');
                    if (parts.Length >= 2)
                    {
                        originX = double.Parse(parts[0].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                        originY = double.Parse(parts[1].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                    }
                }
                else if (t.StartsWith("negate:", StringComparison.Ordinal))
                {
                    negate = t["negate:".Length..].Trim() is not ("0" or "false");
                }
                else if (t.StartsWith("occupied_thresh:", StringComparison.Ordinal))
                {
                    occThresh = double.Parse(t["occupied_thresh:".Length..].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                }
                else if (t.StartsWith("free_thresh:", StringComparison.Ordinal))
                {
                    freeThresh = double.Parse(t["free_thresh:".Length..].Trim(), System.Globalization.CultureInfo.InvariantCulture);
                }
            }
        }

        var (edges, laneWidths) = ParseEdges(rootEl.GetProperty("edges"));
        var endpoints = ParseEndpoints(rootEl.GetProperty("endpoints"));
        var zones = rootEl.TryGetProperty("zones", out var zEl) ? ParseZones(zEl) : [];

        OccupancyGrid? occupancy = null;
        var pgm = Directory.GetFiles(root, "*.pgm").FirstOrDefault();
        if (pgm is not null)
        {
            occupancy = OccupancyGrid.Load(
                File.ReadAllBytes(pgm),
                resolution,
                originX,
                originY,
                negate,
                occThresh,
                freeThresh);
        }

        // Match TrafficGraphCompileService: PARK endpoints are recovery stops.
        var recovery = new HashSet<string>(StringComparer.Ordinal);
        if (rootEl.TryGetProperty("endpoints", out var epEl))
        {
            foreach (var e in epEl.EnumerateArray())
            {
                var enabled = !e.TryGetProperty("is_enabled", out var en) || en.ValueKind != JsonValueKind.False;
                if (!enabled)
                {
                    continue;
                }

                var type = e.TryGetProperty("endpoint_type", out var et) ? et.GetString() : null;
                if (string.Equals(type, "PARK", StringComparison.OrdinalIgnoreCase))
                {
                    recovery.Add(e.GetProperty("code").GetString()!);
                }
            }
        }

        var fp = footprint ?? TrafficFootprintOptions.Default;
        var yaw = LoadEndpointYaws(rootEl);
        // Match TrafficGraphCompileService: always pass the recovery set (possibly empty).
        // null vs [] must not diverge graphHash from Host Check / Debug SVG / route export.
        // EndpointYaw is omitted from graphHash (maneuver classification only).
        return new TrafficCompileInput(
            code,
            frame,
            edges,
            endpoints,
            zones,
            edges.Select(e => new TrafficLaneMeta(
                e.Code,
                WidthMeters: laneWidths.GetValueOrDefault(e.Code, 0.8),
                e.Direction)).ToList(),
            zones.Select(z => new TrafficZoneMeta(z.Code, z.ZoneType)).ToList(),
            fp,
            occupancy,
            ServiceStopEndpointCodes: null,
            RecoveryEndpointCodes: recovery,
            EndpointYaw: yaw);
    }

    private static Dictionary<string, double> LoadEndpointYaws(JsonElement rootEl)
    {
        var map = new Dictionary<string, double>(StringComparer.Ordinal);
        if (!rootEl.TryGetProperty("endpoints", out var epEl))
        {
            return map;
        }

        foreach (var e in epEl.EnumerateArray())
        {
            var code = e.GetProperty("code").GetString()!;
            if (e.TryGetProperty("yaw", out var y) && y.ValueKind == JsonValueKind.Number)
            {
                map[code] = y.GetDouble();
            }
        }

        return map;
    }

    public static (TrafficCompileResult Result, TrafficValidationReport Report) CompileAndValidate(
        string mapFolderName,
        TrafficFootprintOptions? footprint = null)
    {
        var input = Load(mapFolderName, footprint);
        var compiled = TrafficGraphCompiler.Compile(input);
        var report = TrafficGraphValidator.Validate(
            Guid.Empty, compiled.Graph, compiled.Issues, zones: input.Zones);
        return (compiled, report);
    }

    private static (List<RouteGraphEdgeInput> Edges, Dictionary<string, double> Widths) ParseEdges(JsonElement edges)
    {
        var list = new List<RouteGraphEdgeInput>();
        var widths = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var e in edges.EnumerateArray())
        {
            var code = e.GetProperty("code").GetString()!;
            var dir = Enum.Parse<EdgeDirection>(e.GetProperty("direction").GetString()!, ignoreCase: true);
            var active = !e.TryGetProperty("is_active", out var a) || a.ValueKind != JsonValueKind.False;
            double? maxSpeed = e.TryGetProperty("max_speed", out var ms) && ms.ValueKind == JsonValueKind.Number
                ? ms.GetDouble()
                : null;
            var width = e.TryGetProperty("width_meters", out var w) && w.ValueKind == JsonValueKind.Number
                ? w.GetDouble()
                : 0.8;
            widths[code] = width;
            var coords = e.GetProperty("geometry").GetProperty("coordinates");
            var points = coords.EnumerateArray()
                .Select(p => new RoutePoint(p[0].GetDouble(), p[1].GetDouble()))
                .ToList();
            list.Add(new RouteGraphEdgeInput(code, points, dir, maxSpeed, active));
        }

        return (list, widths);
    }

    private static List<RouteGraphEndpointInput> ParseEndpoints(JsonElement endpoints)
    {
        var list = new List<RouteGraphEndpointInput>();
        foreach (var e in endpoints.EnumerateArray())
        {
            var code = e.GetProperty("code").GetString()!;
            var x = e.TryGetProperty("x", out var xe) ? xe.GetDouble() : e.GetProperty("pose_x").GetDouble();
            var y = e.TryGetProperty("y", out var ye) ? ye.GetDouble() : e.GetProperty("pose_y").GetDouble();
            var enabled = !e.TryGetProperty("is_enabled", out var en) || en.ValueKind != JsonValueKind.False;
            list.Add(new RouteGraphEndpointInput(code, x, y, enabled));
        }

        return list;
    }

    private static List<RouteGraphZoneInput> ParseZones(JsonElement zones)
    {
        var list = new List<RouteGraphZoneInput>();
        foreach (var z in zones.EnumerateArray())
        {
            var code = z.GetProperty("code").GetString()!;
            var type = Enum.Parse<ZoneType>(
                z.TryGetProperty("zone_type", out var zt) ? zt.GetString()! : z.GetProperty("zoneType").GetString()!,
                ignoreCase: true);
            var active = !z.TryGetProperty("is_active", out var a) || a.ValueKind != JsonValueKind.False;
            double? maxSpeed = z.TryGetProperty("max_speed", out var ms) && ms.ValueKind == JsonValueKind.Number
                ? ms.GetDouble()
                : null;
            var ringCoords = z.GetProperty("geometry").GetProperty("coordinates")[0];
            var ring = ringCoords.EnumerateArray()
                .Select(p => new RoutePoint(p[0].GetDouble(), p[1].GetDouble()))
                .ToList();
            list.Add(new RouteGraphZoneInput(code, type, ring, maxSpeed, active));
        }

        return list;
    }
}
