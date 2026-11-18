using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Options;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Enums;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Services;

public sealed class RobotConnectivityMonitorHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<MqttOptions> mqttOptions,
    RobotIngressGate ingressGate,
    ILogger<RobotConnectivityMonitorHostedService> logger) : BackgroundService
{
    private DateTimeOffset _activeSince = DateTimeOffset.UtcNow;
    private bool _wasActive = true;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Robot connectivity monitor tick failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        var timeout = TimeSpan.FromSeconds(Math.Max(1, mqttOptions.Value.HeartbeatTimeoutSeconds));
        var cutoff = DateTimeOffset.UtcNow - timeout;
        if (!ingressGate.IsActive)
        {
            _wasActive = false;
            return; // standby: this host sees no heartbeats, so it must not judge them
        }

        if (!_wasActive)
        {
            _wasActive = true;
            _activeSince = DateTimeOffset.UtcNow;
        }

        if (DateTimeOffset.UtcNow - _activeSince < 3 * timeout)
        {
            // Right after start-up / taking over every stored heartbeat looks old only because no host was listening,
            // and the first uplink burst is still being worked off. Judging them now marked live robots OFFLINE and
            // aborted their NAVIGATE on every backend restart.
            return;
        }

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var notifier = scope.ServiceProvider.GetRequiredService<IRobotRealtimeNotifier>();
        var events = scope.ServiceProvider.GetRequiredService<IIntegrationEventPublisher>();

        // Offline only when BOTH heartbeat and telemetry are older than the timeout.
        // Active Mode can briefly starve the 1 Hz HB timer under Nav2/MQTT load while
        // 5 Hz telemetry (and wall-clock receive timestamps) still prove the robot is live.
        var stale = await db.Robots
            .Where(r => r.IsOnline
                        && (r.LastHeartbeatAt == null || r.LastHeartbeatAt < cutoff)
                        && (r.LastTelemetryAt == null || r.LastTelemetryAt < cutoff))
            .ToListAsync(cancellationToken);

        if (stale.Count == 0)
        {
            return;
        }

        var utcNow = DateTimeOffset.UtcNow;
        foreach (var robot in stale)
        {
            if (!robot.MarkOffline(utcNow))
            {
                continue;
            }

            logger.LogInformation(
                "Robot {RobotCode} connectivity OFFLINE (heartbeat timeout)",
                robot.Code);

            await scope.ServiceProvider.GetRequiredService<InFlightCommandAborter>()
                .AbortAsync(robot, InFlightCommandAborter.RobotOffline, utcNow, cancellationToken);
            var segmented = scope.ServiceProvider.GetService<ISegmentedTrafficCoordinator>();

            // V1 active dispatcher still releases so queued navigates can proceed.
            // Segmented coordinator quarantines (no auto-release on heartbeat loss).
            var traffic = scope.ServiceProvider.GetRequiredService<ITrafficCoordinator>();
            traffic.ReleaseAllForOfflineRobot(robot.Id);
            if (segmented is not null)
            {
                await segmented.MarkOfflineAsync(robot.Id, cancellationToken);
            }

            var shadowGuard = scope.ServiceProvider.GetService<ShadowSingleMoverGuard>();
            shadowGuard?.Exit(robot.CurrentMapVersionId, robot.Id);

            // Persist before fan-out so API polls and SignalR subscribers see the same offline snapshot.
            await db.SaveChangesAsync(cancellationToken);

            await notifier.NotifyConnectivityChangedAsync(
                robot.Id,
                robot.Code,
                robot.IsOnline,
                robot.Status,
                robot.LastHeartbeatAt,
                cancellationToken);

            await events.PublishAsync(
                new RobotConnectivityChanged(
                    robot.Id,
                    robot.Code,
                    robot.IsOnline,
                    robot.Status,
                    robot.LastHeartbeatAt),
                cancellationToken);
        }
    }
}
