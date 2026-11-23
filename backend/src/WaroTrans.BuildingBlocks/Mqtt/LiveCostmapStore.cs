using System.Collections.Concurrent;
using System.Text.Json;

namespace WaroTrans.BuildingBlocks.Mqtt;

/// <summary>One live costmap image as the robot sent it (JSON passthrough) and when it arrived.</summary>
public sealed record LiveCostmap(string RobotCode, string Kind, DateTimeOffset ReceivedAt, JsonElement Body);

/// <summary>
/// The newest Nav2 costmap per robot and kind ("global" / "local"), in memory only, for the admin map overlay. View
/// only: traffic and dispatch never read it. A sample older than <see cref="MaxAge"/> is treated as gone.
/// </summary>
public sealed class LiveCostmapStore(TimeProvider clock)
{
    public static readonly TimeSpan MaxAge = TimeSpan.FromSeconds(30);
    private const int MaxPayloadBytes = 256 * 1024;
    private readonly ConcurrentDictionary<(string Robot, string Kind), LiveCostmap> _latest = new();

    public void Put(string robotCode, string payload)
    {
        if (string.IsNullOrWhiteSpace(robotCode) || payload.Length > MaxPayloadBytes)
        {
            return;
        }

        try
        {
            using var doc = JsonDocument.Parse(payload);
            var kind = doc.RootElement.TryGetProperty("kind", out var k) && k.ValueKind == JsonValueKind.String
                ? k.GetString()!
                : "global";
            if (kind is not ("global" or "local"))
            {
                return;
            }

            _latest[(robotCode, kind)] = new LiveCostmap(robotCode, kind, clock.GetUtcNow(), doc.RootElement.Clone());
        }
        catch (JsonException)
        {
            // a broken sample is dropped; the next one replaces it
        }
    }

    public LiveCostmap? Get(string robotCode, string kind) =>
        _latest.TryGetValue((robotCode, kind), out var c) && clock.GetUtcNow() - c.ReceivedAt <= MaxAge ? c : null;
}
