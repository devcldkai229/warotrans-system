using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;

namespace WaroTrans.Evidence.Recorder.Features.Journals.Retention;

/// <summary>
/// Database side of the retention proposal (spec §7.3), matching the S3 lifecycle of raw originals: once a closed
/// journal is older than <see cref="RecorderOptions.RetentionDays"/>, its path samples, events, plans and the local
/// queue leftovers are deleted. A journal under an incident hold (RetentionHoldUntilUtc in the future) is never touched.
/// The journal, its runs and the access audit are kept (who looked at what stays answerable).
/// </summary>
internal sealed class EvidenceRetentionService(
    IServiceScopeFactory scopes,
    IOptions<RecorderOptions> options,
    TimeProvider clock,
    ILogger<EvidenceRetentionService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (options.Value.RetentionDays <= 0)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Evidence retention pass failed");
            }

            await Task.Delay(TimeSpan.FromHours(6), clock, stoppingToken);
        }
    }

    internal async Task<int> RunOnceAsync(CancellationToken ct)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
        var now = clock.GetUtcNow();
        var before = now.AddDays(-options.Value.RetentionDays);
        var expired = await db.Journals
            .Where(j => (j.Status == EvidenceJournalStatus.FINALIZED || j.Status == EvidenceJournalStatus.PARTIAL)
                        && j.LastEndedAtUtc != null && j.LastEndedAtUtc < before
                        && (j.RetentionHoldUntilUtc == null || j.RetentionHoldUntilUtc < now))
            .Select(j => j.Id)
            .Take(100)
            .ToListAsync(ct);
        foreach (var journalId in expired)
        {
            var runIds = db.Runs.Where(r => r.JournalId == journalId).Select(r => r.Id);
            await db.TrajectoryPoints.Where(p => runIds.Contains(p.RobotRunEvidenceId)).ExecuteDeleteAsync(ct);
            await db.RoutePlans.Where(p => runIds.Contains(p.RobotRunEvidenceId)).ExecuteDeleteAsync(ct);
            await db.Events.Where(e => e.JournalId == journalId).ExecuteDeleteAsync(ct);
        }

        await db.LocalQueueMessages.Where(m => m.CreatedAtUtc < before).ExecuteDeleteAsync(ct);
        await db.Inbox.Where(i => i.ProcessedAtUtc < before).ExecuteDeleteAsync(ct);
        if (expired.Count > 0)
        {
            logger.LogInformation("Evidence retention: telemetry of {Count} journal(s) older than {Days} days removed", expired.Count, options.Value.RetentionDays);
        }

        return expired.Count;
    }
}
