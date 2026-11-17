using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Media;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Worker.Features.MediaConvertResult;
using WaroTrans.Evidence.Worker.Features.MediaConvertSubmission;
using WaroTrans.Evidence.Worker.Services;

namespace WaroTrans.Evidence.Worker.Features.Reconciliation;

/// <summary>
/// Media jobs nobody heard from (spec §8.3 step 7, §12.3): a lost media-process message (job still QUEUED), a worker
/// killed mid-submit (SUBMITTING past the claim lease: the provider is asked first), a lost completion event
/// (SUBMITTED/PROGRESSING for too long: GetJob). Never blind-resubmits a job the provider may already run.
/// </summary>
public sealed class MediaReconciliation(
    IServiceScopeFactory scopes,
    IOptions<WorkerOptions> worker,
    IOptions<EvidenceMediaOptions> media,
    TimeProvider clock,
    ILogger<MediaReconciliation> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.Equals(media.Value.Provider, "None", StringComparison.OrdinalIgnoreCase))
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
                logger.LogWarning(ex, "Evidence media reconciliation failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(Math.Max(30, worker.Value.ReconcileIntervalSeconds)), clock, stoppingToken);
        }
    }

    public async Task<int> RunOnceAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var repaired = 0;
        List<Guid> resubmit;
        List<Guid> stale;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
            var lostMessage = now.AddMinutes(-10);
            var leaseOver = now - MediaSubmissionHandler.ClaimLease;
            resubmit = await db.ProcessingJobs
                .Where(j => (j.Status == MediaProcessingStatus.QUEUED && j.CreatedAtUtc < lostMessage)
                            || j.Status == MediaProcessingStatus.RETRY_PENDING
                            || ((j.Status == MediaProcessingStatus.CLAIMED || j.Status == MediaProcessingStatus.SUBMITTING) && j.ClaimedAtUtc < leaseOver))
                .Select(j => j.Id).Take(50).ToListAsync(cancellationToken);
            var staleBefore = now.AddMinutes(-Math.Max(1, media.Value.StaleJobMinutes));
            stale = await db.ProcessingJobs
                .Where(j => (j.Status == MediaProcessingStatus.SUBMITTED || j.Status == MediaProcessingStatus.PROGRESSING)
                            && j.SubmittedAtUtc < staleBefore && j.ProviderJobId != null)
                .Select(j => j.Id).Take(50).ToListAsync(cancellationToken);
        }

        foreach (var id in resubmit)
        {
            await using var scope = scopes.CreateAsyncScope();
            if (await scope.ServiceProvider.GetRequiredService<MediaSubmissionHandler>().SubmitAsync(id, cancellationToken) == MessageOutcome.Done)
            {
                repaired++;
            }
        }

        foreach (var id in stale)
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<EvidenceDbContext>();
            var job = await db.ProcessingJobs.FirstAsync(j => j.Id == id, cancellationToken);
            var provider = await scope.ServiceProvider.GetRequiredService<IMediaTranscoder>().GetAsync(job.ProviderJobId!, cancellationToken);
            if (provider is null || provider.Status is ProviderJobStatus.Submitted or ProviderJobStatus.Progressing)
            {
                continue;
            }

            await scope.ServiceProvider.GetRequiredService<MediaResultHandler>().ApplyAsync(job,
                new MediaJobStateChange(provider.ProviderJobId, provider.Status, job.Id, provider.ErrorCode, provider.ErrorMessage, provider.OutputDurationMs),
                cancellationToken);
            repaired++;
        }

        return repaired;
    }
}
