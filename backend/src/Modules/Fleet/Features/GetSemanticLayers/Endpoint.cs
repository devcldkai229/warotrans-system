using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Authorization;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Features.GetSemanticLayers;

/// <param name="Data">Row-major grey values, first row = top of the image (PGM order), base64.</param>
public sealed record SemanticMaskLayer(
    string Id,
    string Label,
    string Mode,
    double Resolution,
    double OriginX,
    double OriginY,
    int Width,
    int Height,
    string Data);

public sealed record SemanticLayersResponse(
    string? MapCode,
    string? MapVersionId,
    string? Fingerprint,
    double CellSizeMeters,
    IReadOnlyList<SemanticMaskLayer> Layers);

/// <summary>
/// The static costmap layers the robots plan with (keepout, keepout for planning, speed), read from the semantic
/// bundle this Host traffic is bound to, for the admin map overlay. Read-only; the robot's live Nav2 costmap is a
/// separate feed.
/// </summary>
public static class Endpoint
{
    private static readonly (string File, string Id, string Label)[] Masks =
    [
        ("keepout.yaml", "keepout", "Keep-out (costmap filter)"),
        ("keepout_planning.yaml", "keepout_planning", "Keep-out for planning"),
        ("speed.yaml", "speed", "Speed limit mask"),
    ];

    private static readonly object CacheLock = new();
    private static (string Dir, DateTime Stamp, SemanticLayersResponse Body)? _cache;

    public static RouteGroupBuilder MapGetSemanticLayers(this RouteGroupBuilder group)
    {
        group.MapGet("/traffic/semantic-layers", (IOptions<TrafficOptions> options) =>
            {
                var dir = options.Value.SemanticMapDirectory;
                if (string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir))
                {
                    return Results.Problem(statusCode: StatusCodes.Status404NotFound,
                        title: "No semantic bundle is configured (Traffic:SemanticMapDirectory)");
                }

                return Results.Ok(Read(dir, options.Value.SemanticCellSizeMeters));
            })
            .RequirePermission(Permissions.TrafficRead)
            .WithName("GetSemanticLayers")
            .WithSummary("Static costmap layers of the bound semantic bundle (keepout, speed) for the map overlay")
            .WithTags("Traffic");

        // The robot's own live Nav2 costmap (sent by its gateway every 1-3 s), for the admin map overlay.
        group.MapGet("/robots/{id:guid}/costmap", async (Guid id, string? kind, FleetDbContext db, LiveCostmapStore store,
                CancellationToken ct) =>
            {
                var code = await db.Robots.AsNoTracking().Where(r => r.Id == id).Select(r => r.Code).FirstOrDefaultAsync(ct);
                if (code is null)
                {
                    return Results.NotFound();
                }

                var live = store.Get(code, kind is "local" ? "local" : "global");
                return live is null
                    ? Results.NoContent()
                    : Results.Ok(new { live.RobotCode, live.Kind, live.ReceivedAt, costmap = live.Body });
            })
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotLiveCostmap")
            .WithSummary("The robot's latest Nav2 costmap image (global or local); 204 when it sends none")
            .WithTags("Traffic");
        return group;
    }

    public static SemanticLayersResponse Read(string dir, double cellSize)
    {
        var manifest = Path.Combine(dir, "semantic_manifest.json");
        var stamp = File.Exists(manifest) ? File.GetLastWriteTimeUtc(manifest) : DateTime.MinValue;
        lock (CacheLock)
        {
            if (_cache is { } c && c.Dir == dir && c.Stamp == stamp)
            {
                return c.Body;
            }
        }

        string? code = null, id = null, fp = null;
        if (File.Exists(manifest))
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(manifest));
            var root = doc.RootElement;
            code = root.TryGetProperty("mapCode", out var m) ? m.GetString() : null;
            id = root.TryGetProperty("mapVersionId", out var v) ? v.GetString() : null;
            fp = root.TryGetProperty("semanticMapFingerprint", out var f) ? f.GetString() : null;
        }

        var layers = new List<SemanticMaskLayer>();
        foreach (var (file, layerId, label) in Masks)
        {
            if (TryReadMask(Path.Combine(dir, file), layerId, label) is { } layer)
            {
                layers.Add(layer);
            }
        }

        var body = new SemanticLayersResponse(code, id, fp, cellSize, layers);
        lock (CacheLock)
        {
            _cache = (dir, stamp, body);
        }

        return body;
    }

    /// <summary>A map_server style YAML (image, resolution, origin, mode) and its binary PGM (P5).</summary>
    public static SemanticMaskLayer? TryReadMask(string yamlPath, string id, string label)
    {
        if (!File.Exists(yamlPath))
        {
            return null;
        }

        string? image = null, mode = "trinary";
        double resolution = 0;
        var origin = new List<double>();
        var inOrigin = false;
        foreach (var raw in File.ReadAllLines(yamlPath))
        {
            var line = raw.Trim();
            if (inOrigin && line.StartsWith('-'))
            {
                origin.Add(double.Parse(line[1..].Trim(), CultureInfo.InvariantCulture));
                continue;
            }

            inOrigin = false;
            var colon = line.IndexOf(':');
            if (colon < 0)
            {
                continue;
            }

            var key = line[..colon].Trim();
            var value = line[(colon + 1)..].Trim();
            switch (key)
            {
                case "image": image = value; break;
                case "mode": mode = value; break;
                case "resolution": resolution = double.Parse(value, CultureInfo.InvariantCulture); break;
                case "origin":
                    if (value.StartsWith('['))
                    {
                        origin.AddRange(value.Trim('[', ']').Split(',')
                            .Select(s => double.Parse(s.Trim(), CultureInfo.InvariantCulture)));
                    }
                    else
                    {
                        inOrigin = true;
                    }

                    break;
            }
        }

        if (image is null || resolution <= 0 || origin.Count < 2)
        {
            return null;
        }

        var pgmPath = Path.Combine(Path.GetDirectoryName(yamlPath)!, image);
        return File.Exists(pgmPath) && ReadPgm(File.ReadAllBytes(pgmPath)) is { } pgm
            ? new SemanticMaskLayer(id, label, mode, resolution, origin[0], origin[1], pgm.Width, pgm.Height,
                Convert.ToBase64String(pgm.Pixels))
            : null;
    }

    public static (int Width, int Height, byte[] Pixels)? ReadPgm(byte[] bytes)
    {
        // P5 <ws> width <ws> height <ws> maxval <single ws> pixels; '#' comments allowed in the header.
        var pos = 0;
        string? Token()
        {
            while (pos < bytes.Length)
            {
                if (bytes[pos] == '#')
                {
                    while (pos < bytes.Length && bytes[pos] != '\n')
                    {
                        pos++;
                    }
                }
                else if (char.IsWhiteSpace((char)bytes[pos]))
                {
                    pos++;
                }
                else
                {
                    break;
                }
            }

            var start = pos;
            while (pos < bytes.Length && !char.IsWhiteSpace((char)bytes[pos]))
            {
                pos++;
            }

            return pos > start ? System.Text.Encoding.ASCII.GetString(bytes, start, pos - start) : null;
        }

        if (Token() != "P5" || !int.TryParse(Token(), out var w) || !int.TryParse(Token(), out var h)
            || !int.TryParse(Token(), out var max) || max > 255)
        {
            return null;
        }

        pos++; // the single whitespace after maxval
        if (bytes.Length - pos < w * h)
        {
            return null;
        }

        return (w, h, bytes.AsSpan(pos, w * h).ToArray());
    }
}
