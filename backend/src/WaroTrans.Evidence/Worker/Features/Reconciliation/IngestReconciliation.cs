using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Processing;
using WaroTrans.Evidence.Storage;
using WaroTrans.Evidence.Worker.Features.SegmentIngestion;
using WaroTrans.Evidence.Worker.Services;

namespace WaroTrans.Evidence.Worker.Features.Reconciliation;

/// <summary>
/// The safety net under at-least-once notifications (spec §12.3): segments that were granted an upload but never
/// verified are looked up in storage directly (a lost S3 event, a killed worker), and sealed groups whose segments are
/// all verified but that never got a media job are queued. Nothing here trusts a queue message.
/// </summary>
public sealed class IngestReconciliation(
    IServiceScopeFactory scopes,
    IOptions<WorkerOptions> options,
    TimeProvider clock,
    ILogger<IngestReconciliation> logger) : BackgroundService
{
    /// <summary>A grant younger than this may still be uploading: left alone.</summary>
    public static readonly TimeSpan UploadSettle = TimeSpan.FromMinutes(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var fixedCount = await RunOnceAsync(stoppingToken);
                if (fixedCount > 0)
                {
                    logger.LogInformation("Evidence reconciliation repaired {Count} item(s)", fixedCount);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Evidence reconciliation failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(Math.Max(30, options.Value.ReconcileIntervalSeconds)), clock, stoppingToken);
        }
    }

    public async Task<int> RunOnceAsync(CancellationToken cancellationToken)
    {
        var repaired = 0;
        var before = clock.GetUtcNow() - UploadSettle;
        List<(Guid Id, string Key)> pending;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
            pending = (await db.Segments.AsNoTracking()
                    .Where(s => s.S3Key != null && s.CreatedAtUtc < before
                                && (s.UploadStatus == SegmentUploadStatus.UPLOAD_PENDING || s.UploadStatus == SegmentUploadStatus.UPLOADING
                                    || s.UploadStatus == SegmentUploadStatus.UPLOADED))
                    .OrderBy(s => s.CreatedAtUtc)
                    .Take(500)
                    .Select(s => new { s.Id, s.S3Key })
                    .ToListAsync(cancellationToken))
                .Select(s => (s.Id, s.S3Key!))
                .ToList();
        }

        foreach (var (id, key) in pending)
        {
            await using var scope = scopes.CreateAsyncScope();
            var store = scope.ServiceProvider.GetRequiredService<IObjectStore>();
            if (await store.HeadAsync(key, cancellationToken) is null)
            {
                continue; // not uploaded yet: the robot still has it in its spool
            }

            var handler = scope.ServiceProvider.GetRequiredService<SegmentIngestionHandler>();
            if (await handler.VerifyAsync(id, key, 1, cancellationToken) == MessageOutcome.Done)
            {
                repaired++;
            }
        }

        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
            var waiting = await db.ContinuityGroups
                .Where(g => (g.Status == ContinuityGroupStatus.SEALED || g.Status == ContinuityGroupStatus.VERIFYING)
                            && !db.Segments.Any(s => s.ContinuityGroupId == g.Id
                                                     && s.UploadStatus != SegmentUploadStatus.VERIFIED
                                                     && s.UploadStatus != SegmentUploadStatus.QUARANTINED))
                .Select(g => g.Id)
                .Take(200)
                .ToListAsync(cancellationToken);
            foreach (var groupId in waiting)
            {
                repaired += (await GroupReadiness.EvaluateAsync(db, groupId, clock.GetUtcNow(), cancellationToken)).Count;
            }

            await db.SaveChangesAsync(cancellationToken);
        }

        return repaired;
    }
}
