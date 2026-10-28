using System.Collections.Immutable;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Shadow Mode: observes MOVE / grant / telemetry events, drives the segmented coordinator,
/// and logs comparison against V1 outcomes. Never issues motion commands.
/// </summary>
public sealed class TrafficShadowObserver(
    ISegmentedTrafficCoordinator segmented,
    ITrafficCoordinator v1,
    RoutePlanner planner,
    IOptions<TrafficOptions> trafficOptions,
    ILogger<TrafficShadowObserver> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public async Task OnMoveRequestedAsync(
        Guid robotId,
        Guid mapVersionId,
        CompiledTrafficGraph graph,
        double poseX,
        double poseY,
        int startNodeId,
        int goalNodeId,
        Guid jobStepId,
        Guid? jobId,
        RouteGrantResult v1Result,
        CancellationToken ct = default)
    {
        await segmented.BindGraphAsync(mapVersionId, graph, ct).ConfigureAwait(false);

        var request = new RoutePlanRequest(
            Guid.NewGuid(),
            robotId,
            mapVersionId,
            graph,
            poseX,
            poseY,
            GoalEndpointCode: null,
            GoalNodeId: goalNodeId,
            Priority: 0,
            JobStepId: jobStepId,
            JobId: jobId);

        var plan = await segmented.RequestSegmentAsync(request, ct).ConfigureAwait(false);
        if (!plan.Ok || plan.Segments.Length == 0)
        {
            logger.LogInformation(
                "Traffic shadow: robot {RobotId} plan unreachable reason={Reason} v1Granted={V1Granted} v1Queued={V1Queued}",
                robotId, plan.Reason, v1Result.Granted, v1Result.WaitQueued);
            return;
        }

        var acquire = await segmented.AcquireAtomicAsync(
            plan.Segments[0], segmented.Epoch, null, ct).ConfigureAwait(false);

        var shadowEdges = acquire.Authority?.EdgeIds ?? plan.Segments[0].EdgeIds;
        var match = v1Result.Granted == acquire.Granted &&
                    (!v1Result.Granted || EdgesMatch(v1Result.EdgeIds, shadowEdges));

        logger.LogInformation(
            "Traffic shadow compare robot={RobotId} jobStep={JobStepId} match={Match} v1Granted={V1} shadowGranted={Shadow} shadowQueued={Queued} reason={Reason} start={Start} goal={Goal}",
            robotId,
            jobStepId,
            match,
            v1Result.Granted,
            acquire.Granted,
            acquire.Queued,
            acquire.Reason ?? plan.Reason,
            startNodeId,
            goalNodeId);

        _ = v1;
        _ = planner;
    }

    public Task OnCommandResultAsync(Guid robotId, Guid? jobStepId, bool success, CancellationToken ct = default)
    {
        _ = jobStepId;
        _ = success;
        // Shadow does not release on command result alone — verified exit / quarantine path.
        logger.LogDebug("Traffic shadow: command result robot={RobotId} success={Success}", robotId, success);
        return Task.CompletedTask;
    }

    public async Task OnTelemetryAsync(
        Guid robotId,
        double poseX,
        double poseY,
        bool localizationOk,
        CancellationToken ct = default)
    {
        // Active Mode: traffic_progress is the sole progress/authority channel. Feeding every
        // telemetry LOST sample into ReportProgress sticky-quarantines and starves RENEW.
        if (trafficOptions.Value.Mode == TrafficCoordinatorMode.Active)
        {
            return;
        }

        var snap = await segmented.GetTrafficSnapshotAsync(ct).ConfigureAwait(false);
        var robot = snap.Robots.FirstOrDefault(r => r.RobotId == robotId);
        if (robot is null)
        {
            return;
        }

        await segmented.ReportProgressAsync(
            robotId,
            robot.LastSeq + 1,
            snap.Epoch,
            null,
            poseX,
            poseY,
            localizationOk,
            ct).ConfigureAwait(false);
    }

    public Task OnOfflineAsync(Guid robotId, CancellationToken ct = default) =>
        segmented.MarkOfflineAsync(robotId, ct);

    /// <summary>
    /// Cumulative authority edges: <c>authority.segmentEdgeIds</c> of an Active NAVIGATE, or the top-level
    /// <c>segmentEdgeIds</c> of an EXTEND_AUTHORITY payload.
    /// </summary>
    public static ImmutableArray<int> ParseAuthorityEdgeIds(string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return [];
        }

        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            var root = doc.RootElement;
            if (root.TryGetProperty("authority", out var authority) && authority.ValueKind == JsonValueKind.Object)
            {
                root = authority;
            }

            return root.TryGetProperty("segmentEdgeIds", out var edges) && edges.ValueKind == JsonValueKind.Array
                ? edges.EnumerateArray().Select(e => e.GetInt32()).ToImmutableArray()
                : [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static ImmutableArray<int> ParseRouteEdgeIds(string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return [];
        }

        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            if (!doc.RootElement.TryGetProperty("route", out var route) &&
                !doc.RootElement.TryGetProperty("Route", out route))
            {
                return [];
            }

            if (!route.TryGetProperty("edgeIds", out var edges) &&
                !route.TryGetProperty("EdgeIds", out edges))
            {
                return [];
            }

            return edges.EnumerateArray().Select(e => e.GetInt32()).ToImmutableArray();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static bool EdgesMatch(IReadOnlyList<int> a, IReadOnlyList<int> b)
    {
        if (a.Count != b.Count)
        {
            return false;
        }

        for (var i = 0; i < a.Count; i++)
        {
            if (a[i] != b[i])
            {
                return false;
            }
        }

        return true;
    }
}
