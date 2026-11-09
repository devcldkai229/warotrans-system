using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Services;

/// <summary>BOTH-02: keeps state history for <c>Fleet:History:RetentionDays</c> (default 90). Commands stay: Jobs refer to them.</summary>
public sealed class RobotHistoryRetentionHostedService(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    TimeProvider clock,
    ILogger<RobotHistoryRetentionHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(6));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
            {
                try
                {
                    await using var scope = scopeFactory.CreateAsyncScope();
                    var days = configuration.GetValue("Fleet:History:RetentionDays", 90);
                    var cutoff = clock.GetUtcNow().AddDays(-Math.Max(1, days));
                    var removed = await scope.ServiceProvider.GetRequiredService<FleetDbContext>().RobotStateEvents
                        .Where(e => e.OccurredAt < cutoff)
                        .ExecuteDeleteAsync(stoppingToken)
                        .ConfigureAwait(false);
                    if (removed > 0)
                    {
                        logger.LogInformation("Removed {Count} robot state events older than {Days} days", removed, days);
                    }
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
}
