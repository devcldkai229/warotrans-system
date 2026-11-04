using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Stage-3: bind SINGLE_OCCUPANCY / fingerprint policy at host start when
/// <c>Traffic:Mode=Semantic</c> so standalone NavigateToPose + MQTT <c>traffic_plan</c>
/// works without a Transport Job (prompt dual-robot acceptance).
/// </summary>
public sealed class SemanticPolicyBootstrapHostedService(
    ISegmentedTrafficCoordinator coordinator,
    IOptions<TrafficOptions> options,
    ILogger<SemanticPolicyBootstrapHostedService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var opts = options.Value;
        if (opts.Mode != TrafficCoordinatorMode.Semantic)
        {
            logger.LogInformation("SemanticPolicyBootstrap skipped (Mode={Mode})", opts.Mode);
            return;
        }

        var mapDir = opts.SemanticMapDirectory?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(mapDir) || !Directory.Exists(mapDir))
        {
            logger.LogError(
                "SemanticPolicyBootstrap: SemanticMapDirectory missing or not found: '{Dir}'",
                mapDir);
            return;
        }

        var mapVersionId = Guid.Empty;
        var mapVersionCode = "";
        var manifestPath = Path.Combine(mapDir, "semantic_manifest.json");
        if (File.Exists(manifestPath))
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(manifestPath));
                if (doc.RootElement.TryGetProperty("mapVersionId", out var idEl)
                    && Guid.TryParse(idEl.GetString(), out var parsed))
                {
                    mapVersionId = parsed;
                }

                if (doc.RootElement.TryGetProperty("mapCode", out var codeEl)
                    && !string.IsNullOrWhiteSpace(codeEl.GetString()))
                {
                    mapVersionCode = codeEl.GetString()!;
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "SemanticPolicyBootstrap: could not parse mapVersionId from manifest");
            }
        }

        // No guessing: a bundle that does not say which published map it belongs to cannot be bound.
        if (mapVersionId == Guid.Empty || string.IsNullOrWhiteSpace(mapVersionCode))
        {
            logger.LogError(
                "SemanticPolicyBootstrap: {Manifest} has no mapVersionId/mapCode; not binding",
                manifestPath);
            return;
        }

        var policy = SemanticReservation.TryLoadFromDirectory(mapDir, mapVersionId, mapVersionCode);
        if (policy is null)
        {
            logger.LogError(
                "SemanticPolicyBootstrap: failed to load semantic_manifest/single_occupancy from {Dir}",
                mapDir);
            return;
        }

        policy = policy with
        {
            HorizonMeters = opts.SemanticHorizonMeters,
            CellSizeMeters = opts.SemanticCellSizeMeters,
            FootprintHalfLength = Math.Max(0.01, opts.Footprint.LengthMeters / 2.0 + opts.Footprint.PaddingMeters),
            FootprintHalfWidth = Math.Max(0.01, opts.Footprint.WidthMeters / 2.0 + opts.Footprint.PaddingMeters),
        };

        var bind = await coordinator.BindSemanticPolicyAsync(policy, cancellationToken).ConfigureAwait(false);
        if (!bind.Ok)
        {
            logger.LogError("SemanticPolicyBootstrap bind failed: {Reason}", bind.Reason);
            return;
        }

        logger.LogInformation(
            "SemanticPolicyBootstrap bound fingerprint={Fp} zones={Zones} cell={Cell}m horizon={Horizon}m",
            policy.SemanticMapFingerprint,
            policy.SingleOccupancyZones.Length,
            policy.CellSizeMeters,
            policy.HorizonMeters);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
