using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Navigation.Traffic;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Fail-closed startup: new epoch, rebuild occupancy from open NAVIGATE commands + telemetry,
/// quarantine uncertain robots, then open the segmented coordinator for Shadow observation.
/// Does not reference WorkflowExecution (no circular module dependency).
/// </summary>
public sealed class TrafficReconciliationHostedService(
    ISegmentedTrafficCoordinator segmented,
    IServiceScopeFactory scopeFactory,
    IOptions<TrafficOptions> options,
    ILogger<TrafficReconciliationHostedService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var fleetDb = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var compile = scope.ServiceProvider.GetService<TrafficGraphCompileService>();

        var openCommands = await fleetDb.RobotCommands
            .AsNoTracking()
            .Where(c => c.Type == RobotCommandType.NAVIGATE_TO_POSE &&
                        (c.Status == RobotCommandStatus.SENT ||
                         c.Status == RobotCommandStatus.ACKED ||
                         c.Status == RobotCommandStatus.RUNNING))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Every enabled robot occupies the floor under it — parked, holding a bay through HUMAN_CONFIRM, or moving —
        // not only robots with an open NAVIGATE (audit T8).
        var openRobotIds = openCommands.Select(c => c.RobotId).Distinct().ToList();
        var robots = await fleetDb.Robots
            .AsNoTracking()
            .Where(r => r.IsEnabled && (r.IsOnline || openRobotIds.Contains(r.Id)))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var openIds = openCommands.Select(c => c.Id).ToList();
        var extends = await fleetDb.RobotCommands
            .AsNoTracking()
            .Where(c => c.Type == RobotCommandType.EXTEND_AUTHORITY && c.TargetCommandId != null
                        && openIds.Contains(c.TargetCommandId.Value))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var seeds = new List<TrafficReconcileSeed>();
        Guid? mapVersionId = null;
        CompiledTrafficGraph? graph = null;

        foreach (var robot in robots.OrderBy(r => r.Id))
        {
            mapVersionId ??= robot.CurrentMapVersionId;
            var cmd = openCommands
                .Where(c => c.RobotId == robot.Id)
                .OrderByDescending(c => c.IssuedAt)
                .FirstOrDefault();

            // Latest cumulative authority: the newest EXTEND of that NAVIGATE, else its first segment.
            var latestExtend = cmd is null
                ? null
                : extends.Where(e => e.TargetCommandId == cmd.Id).MaxBy(e => e.IssuedAt);
            var edges = TrafficShadowObserver.ParseAuthorityEdgeIds(latestExtend?.PayloadJson) is { Length: > 0 } extended
                ? extended
                : TrafficShadowObserver.ParseAuthorityEdgeIds(cmd?.PayloadJson) is { Length: > 0 } granted
                    ? granted
                    : TrafficShadowObserver.ParseRouteEdgeIds(cmd?.PayloadJson);
            var locOk = robot.LocalizationStatus == LocalizationStatus.LOCALIZED;
            var poseKnown = robot.LastTelemetryAt is not null;

            seeds.Add(new TrafficReconcileSeed(
                robot.Id,
                cmd?.JobStepId,
                edges,
                poseKnown ? robot.PoseX : null,
                poseKnown ? robot.PoseY : null,
                locOk,
                poseKnown));
        }

        if (mapVersionId is Guid mv && compile is not null)
        {
            try
            {
                var compiled = await compile.CompileAsync(mv, TrafficGraphCompileService.RuntimeIncludesOccupancy, cancellationToken)
                    .ConfigureAwait(false);
                graph = compiled.Result.Graph;
                await segmented.BindGraphAsync(mv, graph, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Traffic reconcile: failed to compile graph for map {MapVersionId}", mv);
            }
        }

        _ = options;
        await segmented.CompleteReconciliationAsync(seeds, cancellationToken).ConfigureAwait(false);
        logger.LogInformation(
            "Traffic reconcile complete: seeds={SeedCount} graphBound={Bound} mode={Mode}",
            seeds.Count,
            graph is not null,
            options.Value.Mode);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
