using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.Dispatch;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.Charging;

/// <summary>What a robot's charge looks like to the person deciding whether to unplug it.</summary>
public sealed record RobotChargingResponse(
    Guid RobotId,
    string RobotCode,
    string Status,
    decimal? BatteryPercent,
    DateTimeOffset? ChargingSince,
    DateTimeOffset? ChargeFullAt,
    decimal FullPercent);

/// <summary>
/// Manual charging (no auto-dock): a person plugs the charger in and confirms it (CHARGING), the system tells Admins and
/// the robot's Technicians once the battery is full (and reminds them once if nobody unplugs it), and a person confirms
/// the charger is unplugged (AVAILABLE). A full battery never ends a charge by itself: the cable is still in.
/// </summary>
public sealed class RobotChargingService(
    FleetDbContext db,
    IIntegrationEventPublisher events,
    IAuditTrail audit,
    TimeProvider clock,
    IOptions<BatteryOptions> battery)
{
    public const string NotFullCode = "charge_not_full";

    private decimal FullPercent => battery.Value.ChargeFullPercent;

    public static bool IsFull(Robot robot, decimal fullPercent) =>
        robot.BatteryMeasuredAt is not null && robot.BatteryPercent >= fullPercent;

    public async Task<RobotChargingResponse> StartAsync(Guid robotId, Guid? jobId, CancellationToken cancellationToken)
    {
        var before = RobotStatus.CHARGING;
        var robot = await SaveWithRetryAsync(robotId, r =>
        {
            before = r.Status;
            if (r.Status != RobotStatus.CHARGING)
            {
                r.StartCharging(clock.GetUtcNow());
            }
        }, cancellationToken);
        if (before == RobotStatus.CHARGING)
        {
            return ToResponse(robot);
        }

        await audit.RecordAsync(
            new AuditEntry("robot.charging_started", "ROBOT", robot.Id,
                Before: new Dictionary<string, object?> { ["status"] = before.ToString() },
                After: new Dictionary<string, object?>
                {
                    ["status"] = robot.Status.ToString(), ["batteryPercent"] = Battery(robot), ["jobId"] = jobId
                }),
            cancellationToken);
        await events.PublishAsync(new RobotChargingStarted(robot.Id, robot.Code, Battery(robot)), cancellationToken);
        return ToResponse(robot);
    }

    /// <param name="force">Unplug before the battery is full (the robot is needed now).</param>
    public async Task<RobotChargingResponse> EndAsync(Guid robotId, bool force, CancellationToken cancellationToken)
    {
        var full = false;
        DateTimeOffset? since = null;
        var robot = await SaveWithRetryAsync(robotId, r =>
        {
            if (r.Status != RobotStatus.CHARGING)
            {
                throw new ConflictException($"Robot {r.Code} is not charging.", "robot_not_charging");
            }

            full = IsFull(r, FullPercent);
            if (!force && !full)
            {
                var level = Battery(r) is { } p ? $"{p:0}%" : "unknown";
                throw new ConflictException(
                    $"Robot {r.Code} battery is {level}, not full ({FullPercent:0}%). Confirm to end the charge anyway.",
                    NotFullCode);
            }

            since = r.ChargingSince;
            r.EndCharging(clock.GetUtcNow());
        }, cancellationToken);

        await audit.RecordAsync(
            new AuditEntry("robot.charging_ended", "ROBOT", robot.Id,
                Before: new Dictionary<string, object?> { ["status"] = RobotStatus.CHARGING.ToString(), ["chargingSince"] = since },
                After: new Dictionary<string, object?>
                {
                    ["status"] = robot.Status.ToString(), ["batteryPercent"] = Battery(robot), ["beforeFull"] = !full
                }),
            cancellationToken);
        await events.PublishAsync(new RobotChargingEnded(robot.Id, robot.Code, Battery(robot)), cancellationToken);
        return ToResponse(robot);
    }

    public async Task<RobotChargingResponse> GetAsync(Guid robotId, CancellationToken cancellationToken) =>
        ToResponse(await LoadAsync(robotId, cancellationToken, tracking: false));

    /// <summary>
    /// Telemetry just updated the battery: the first full reading of a charge notifies, once (a guarded write, so two
    /// readings at the same time cannot both notify). A robot that reports FULL itself counts as full.
    /// </summary>
    public async Task NoticeFullAsync(
        Guid robotId, string robotCode, decimal? batteryPercent, string? chargingState, CancellationToken cancellationToken)
    {
        var full = batteryPercent is { } p && p >= FullPercent
                   || string.Equals(chargingState, "FULL", StringComparison.OrdinalIgnoreCase);
        if (!full)
        {
            return;
        }

        var now = clock.GetUtcNow();
        var marked = await db.Robots
            .Where(r => r.Id == robotId && r.Status == RobotStatus.CHARGING && r.ChargeFullAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.ChargeFullAt, (DateTimeOffset?)now), cancellationToken);
        if (marked == 1)
        {
            await events.PublishAsync(new RobotChargeFull(robotId, robotCode, batteryPercent, Reminder: false), cancellationToken);
        }
    }

    /// <summary>One reminder per charge when the charger is still in long after the battery was full.</summary>
    public async Task<int> RemindAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var due = now - TimeSpan.FromMinutes(Math.Max(1, battery.Value.UnplugReminderMinutes));
        var robots = await db.Robots.AsNoTracking()
            .Where(r => r.Status == RobotStatus.CHARGING && r.ChargeFullAt != null && r.ChargeFullAt <= due && r.ChargeReminderAt == null)
            .Select(r => new { r.Id, r.Code, r.BatteryPercent, r.BatteryMeasuredAt })
            .ToListAsync(cancellationToken);
        var sent = 0;
        foreach (var robot in robots)
        {
            var marked = await db.Robots
                .Where(r => r.Id == robot.Id && r.Status == RobotStatus.CHARGING && r.ChargeReminderAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.ChargeReminderAt, (DateTimeOffset?)now), cancellationToken);
            if (marked != 1)
            {
                continue;
            }

            sent++;
            await events.PublishAsync(
                new RobotChargeFull(robot.Id, robot.Code, robot.BatteryMeasuredAt is null ? null : robot.BatteryPercent, Reminder: true),
                cancellationToken);
        }

        return sent;
    }

    private const int MaxSaveAttempts = 5;

    /// <summary>Telemetry (several per second) updates the robot row: on a concurrency conflict, read it again and retry.</summary>
    private async Task<Robot> SaveWithRetryAsync(Guid robotId, Action<Robot> change, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            var robot = await LoadAsync(robotId, cancellationToken);
            change(robot);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return robot;
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxSaveAttempts)
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    private async Task<Robot> LoadAsync(Guid robotId, CancellationToken cancellationToken, bool tracking = true)
    {
        var query = tracking ? db.Robots : db.Robots.AsNoTracking();
        return await query.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
               ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
    }

    private static decimal? Battery(Robot robot) => robot.BatteryMeasuredAt is null ? null : robot.BatteryPercent;

    private RobotChargingResponse ToResponse(Robot robot) =>
        new(robot.Id, robot.Code, robot.Status.ToString(), Battery(robot), robot.ChargingSince, robot.ChargeFullAt, FullPercent);
}

/// <summary>Sends the "charger still plugged in" reminder (once per charge).</summary>
public sealed class ChargeReminderHostedService(IServiceScopeFactory scopes, ILogger<ChargeReminderHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<RobotChargingService>().RemindAsync(stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Charge reminder sweep failed");
            }
        }
    }
}
