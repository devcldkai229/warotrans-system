using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.Fleet.Features.PoseHistory;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

/// <summary>
/// BOTH-02 / FE-09: keeps state history for <c>Fleet:History:RetentionDays</c> (default 90) and movement history for
/// <c>Fleet:History:PoseRetentionDays</c> (default 7). Commands stay: Jobs refer to them.
/// </summary>
public sealed class RobotHistoryRetentionHostedService(
    IServiceScopeFactory scopeFactory,
    IOptions<RobotHistoryOptions> options,
    TimeProvider clock,
    ILogger<RobotHistoryRetentionHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(Math.Max(1, options.Value.RetentionSweepMinutes)));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                try
                {
                    await SweepAsync(stoppingToken).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogWarning(ex, "Robot history retention failed");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    /// <summary>Deletes what is older than each retention period; returns (state events, pose samples) removed.</summary>
    public async Task<(int States, int Poses)> SweepAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var now = clock.GetUtcNow();
        var settings = options.Value;

        var stateCutoff = now.AddDays(-Math.Max(1, settings.RetentionDays));
        var states = await db.RobotStateEvents
            .Where(e => e.OccurredAt < stateCutoff)
            .ExecuteDeleteAsync(cancellationToken)
            .ConfigureAwait(false);

        var poseCutoff = now.AddDays(-Math.Max(1, settings.PoseRetentionDays));
        var poses = await db.RobotPoseSamples
            .Where(p => p.RecordedAt < poseCutoff)
            .ExecuteDeleteAsync(cancellationToken)
            .ConfigureAwait(false);

        if (states > 0 || poses > 0)
        {
            logger.LogInformation(
                "Removed {States} robot state events older than {StateDays} days and {Poses} movement points older than {PoseDays} days",
                states,
                settings.RetentionDays,
                poses,
                settings.PoseRetentionDays);
        }

        return (states, poses);
    }
}
