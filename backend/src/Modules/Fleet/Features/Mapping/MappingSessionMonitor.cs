using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.Mapping;

/// <summary>
/// Moves open mapping sessions on even when nobody has the page open: the robot's answers, timeouts, a robot that
/// restarted or stayed offline. The page's own polling does the same, sooner.
/// </summary>
public sealed class MappingSessionMonitor(
    IServiceScopeFactory scopes,
    TimeProvider clock,
    ILogger<MappingSessionMonitor> logger) : BackgroundService
{
    private static readonly TimeSpan Period = TimeSpan.FromSeconds(3);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Mapping session tick failed");
            }

            await Task.Delay(Period, clock, stoppingToken);
        }
    }

    private async Task TickAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var open = await db.MappingSessions.Where(s => MappingSession.OpenStatuses.Contains(s.Status)).ToListAsync(ct);
        if (open.Count == 0) return;
        var mapping = scope.ServiceProvider.GetRequiredService<MappingService>();
        foreach (var session in open)
        {
            var before = session.Status;
            if (await mapping.ReconcileAsync(session, ct))
            {
                logger.LogInformation("Mapping session {Session} ({Robot}) {Before} -> {After} {Error}",
                    session.Id, session.RobotCode, before, session.Status, session.ErrorCode);
            }
        }
    }
}
