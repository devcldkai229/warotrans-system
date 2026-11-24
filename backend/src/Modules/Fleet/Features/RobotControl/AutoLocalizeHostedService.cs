using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.RobotControl;

public sealed class AutoLocalizeOptions
{
    public const string SectionName = "FleetLocalization";

    /// <summary>
    /// Ask a robot to localize itself when it is online and not localized: it just connected, its map was changed, the
    /// backend restarted. Off by default: then only an operator starts it (web: Auto-localize).
    /// </summary>
    public bool AutoOnConnect { get; set; }

    /// <summary>Let the automatic run turn the robot on the spot. Off: an automatic run never moves the robot.</summary>
    public bool AutoAllowSpin { get; set; }

    public int PollSeconds { get; set; } = 5;

    /// <summary>Wait at least this long between two automatic runs of one robot.</summary>
    public int RetryAfterSeconds { get; set; } = 60;

    /// <summary>After a run that found nothing sure, wait this long (a person should look), unless the map changed.</summary>
    public int RetryAfterFailureSeconds { get; set; } = 600;

    /// <summary>The robot's telemetry must be this fresh (its gateway, scan and map are up).</summary>
    public int MaxTelemetryAgeSeconds { get; set; } = 10;
}

/// <summary>Sends AUTO_LOCALIZE to robots that are online and not localized, when <see cref="AutoLocalizeOptions.AutoOnConnect"/>.</summary>
public sealed class AutoLocalizeHostedService(
    IServiceScopeFactory scopes,
    IOptionsMonitor<AutoLocalizeOptions> options,
    TimeProvider clock,
    ILogger<AutoLocalizeHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var current = options.CurrentValue;
            try
            {
                if (current.AutoOnConnect)
                {
                    await TickAsync(current, stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Auto-localize tick failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(Math.Max(1, current.PollSeconds)), clock, stoppingToken);
        }
    }

    public async Task TickAsync(AutoLocalizeOptions settings, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var control = scope.ServiceProvider.GetRequiredService<RobotControlService>();
        var now = clock.GetUtcNow();
        var fresh = now - TimeSpan.FromSeconds(settings.MaxTelemetryAgeSeconds);
        var robots = await db.Robots.AsNoTracking()
            .Where(r => r.IsOnline && r.IsEnabled
                        && r.LocalizationStatus != LocalizationStatus.LOCALIZED
                        && r.CurrentCommandId == null
                        && r.Status != RobotStatus.EXECUTING && r.Status != RobotStatus.MAINTENANCE
                        && r.LastTelemetryAt != null && r.LastTelemetryAt > fresh)
            .ToListAsync(cancellationToken);

        foreach (var robot in robots)
        {
            if (robot.HasActiveManualLease(now)) continue;
            var last = await db.RobotCommands.AsNoTracking()
                .Where(c => c.RobotId == robot.Id && c.Type == RobotCommandType.AUTO_LOCALIZE)
                .OrderByDescending(c => c.IssuedAt)
                .FirstOrDefaultAsync(cancellationToken);
            if (!Due(last, robot, now, settings)) continue;

            var trigger = last is not null && !SameMap(last, robot) ? AutoLocalizeTriggers.MapChanged : AutoLocalizeTriggers.Auto;
            try
            {
                var commandId = await control.AutoLocalizeAsync(robot.Id, settings.AutoAllowSpin, trigger, cancellationToken);
                logger.LogInformation("Auto-localize {CommandId} sent to {RobotCode} ({Trigger})", commandId, robot.Code, trigger);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogInformation("Auto-localize of {RobotCode} not sent: {Reason}", robot.Code, ex.Message);
            }
        }
    }

    /// <summary>Whether an automatic run of this robot is due, given its last run.</summary>
    public static bool Due(RobotCommand? last, Robot robot, DateTimeOffset now, AutoLocalizeOptions settings)
    {
        if (last is null) return true;
        if (last.IsInFlight && now - last.IssuedAt < RobotControlService.AutoLocalizeStaleAfter) return false;
        if (!SameMap(last, robot)) return true; // a new map: try at once, whatever happened on the old one
        var failed = last.Status is not RobotCommandStatus.COMPLETED;
        var wait = TimeSpan.FromSeconds(failed ? settings.RetryAfterFailureSeconds : settings.RetryAfterSeconds);
        return now - last.IssuedAt >= wait;
    }

    private static bool SameMap(RobotCommand command, Robot robot) =>
        command.PayloadJson.Contains(robot.CurrentMapVersionId.ToString(), StringComparison.OrdinalIgnoreCase);
}
