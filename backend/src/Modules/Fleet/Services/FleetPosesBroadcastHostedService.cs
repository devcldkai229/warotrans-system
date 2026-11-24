using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Services;

/// <summary>
/// Tells every robot where all robots are and how big they are, about 2.5 times a second (topic
/// <see cref="RobotMqttTopics.FleetPoses"/>). The robot gateway turns the OTHER robots into points of its costmaps and
/// collision monitor (warotrans_fleet_layer). A 2D lidar scanning at ~18 cm sees little of a robot whose body is 10 cm
/// high: two real robots came within 5 cm of each other (2026-11-22, 2026-11-23). Only online robots with a pose
/// reported in the last few seconds are sent; a robot that lost its localization is still sent (its last pose, flagged),
/// because it is still somewhere.
/// </summary>
public sealed class FleetPosesBroadcastHostedService(
    IServiceScopeFactory scopes,
    IMqttTrafficEpochPublisher publisher,
    IOptions<TrafficOptions> trafficOptions,
    ILogger<FleetPosesBroadcastHostedService> logger,
    TimeProvider? clock = null) : BackgroundService
{
    private static readonly TimeSpan Period = TimeSpan.FromMilliseconds(400);
    private static readonly TimeSpan MaxPoseAge = TimeSpan.FromSeconds(5);
    private readonly TimeProvider _clock = clock ?? TimeProvider.System;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (trafficOptions.Value.Mode is not (TrafficCoordinatorMode.Semantic or TrafficCoordinatorMode.Active))
        {
            return;
        }

        using var timer = new PeriodicTimer(Period, _clock);
        var failures = 0;
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await TickAsync(stoppingToken).ConfigureAwait(false);
                failures = 0;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                // The broker may be down for a moment: keep trying, log once in a while.
                if (failures++ % 50 == 0)
                {
                    logger.LogWarning(ex, "Fleet poses broadcast failed ({Failures} in a row)", failures);
                }
            }
        }
    }

    private async Task TickAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var now = _clock.GetUtcNow();
        var since = now - MaxPoseAge;
        var footprint = trafficOptions.Value.Footprint;
        var robots = await db.Robots.AsNoTracking()
            .Where(r => r.IsOnline && r.LastTelemetryAt != null && r.LastTelemetryAt >= since)
            .Select(r => new
            {
                r.Code,
                r.PoseX,
                r.PoseY,
                r.PoseYaw,
                r.LengthM,
                r.WidthM,
                r.LocalizationStatus,
                r.LastTelemetryAt,
                r.CurrentMapVersionId
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (robots.Count == 0)
        {
            return;
        }

        await publisher.PublishFleetPosesAsync(new
        {
            schemaVersion = 1,
            sentAt = now,
            robots = robots.Select(r => new
            {
                robotCode = r.Code,
                mapVersionId = r.CurrentMapVersionId,
                x = r.PoseX,
                y = r.PoseY,
                yaw = r.PoseYaw,
                lengthM = r.LengthM ?? footprint.LengthMeters,
                widthM = r.WidthM ?? footprint.WidthMeters,
                localized = r.LocalizationStatus == LocalizationStatus.LOCALIZED,
                poseAgeMs = (int)(now - r.LastTelemetryAt!.Value).TotalMilliseconds
            })
        }, cancellationToken).ConfigureAwait(false);
    }
}
