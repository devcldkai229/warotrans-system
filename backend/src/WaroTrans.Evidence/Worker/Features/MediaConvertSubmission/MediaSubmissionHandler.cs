using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Media;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Processing;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Storage;
using WaroTrans.Evidence.Worker.Services;

namespace WaroTrans.Evidence.Worker.Features.MediaConvertSubmission;

/// <summary>
/// media-process: submit one transcode per (group, profile, manifest) (spec §8.6). The job row is claimed atomically
/// (QUEUED → CLAIMED by a conditional UPDATE) before anything is sent, so two workers never both submit. A job left in
/// SUBMITTING by a crash is first looked up at the provider and adopted; only a job the provider does not know is sent
/// again. CreateJob is quick: the message is deleted once SUBMITTED is saved, the result comes on media-result.
/// </summary>
public sealed class MediaSubmissionHandler(
    EvidenceDbContext db,
    IMediaTranscoder transcoder,
    EvidenceStorageOptions storage,
    TimeProvider clock,
    ILogger<MediaSubmissionHandler> logger) : IQueueMessageHandler
{
    public static readonly TimeSpan ClaimLease = TimeSpan.FromMinutes(2);
    private static readonly string WorkerId = $"{Environment.MachineName}:{Environment.ProcessId}";

    public string Queue => EvidenceQueues.MediaProcess;

    public async Task<MessageOutcome> HandleAsync(QueueMessage message, CancellationToken cancellationToken)
    {
        var request = JsonSerializer.Deserialize<MediaProcessRequested>(message.Body, GroupReadiness.Json);
        if (request is null || request.EventType != MediaProcessRequested.Type)
        {
            return MessageOutcome.Drop;
        }

        return await SubmitAsync(request.MediaProcessingJobId, cancellationToken);
    }

    /// <summary>Also used by reconciliation for jobs whose message was lost.</summary>
    public async Task<MessageOutcome> SubmitAsync(Guid jobId, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var leaseExpired = now - ClaimLease;
        // Atomic claim: only one worker moves it out of QUEUED / RETRY_PENDING (or takes over an expired claim).
        var claimed = await db.ProcessingJobs
            .Where(j => j.Id == jobId && (j.Status == MediaProcessingStatus.QUEUED || j.Status == MediaProcessingStatus.RETRY_PENDING
                                          || ((j.Status == MediaProcessingStatus.CLAIMED || j.Status == MediaProcessingStatus.SUBMITTING)
                                              && j.ClaimedAtUtc < leaseExpired)))
            .ExecuteUpdateAsync(s => s
                .SetProperty(j => j.Status, MediaProcessingStatus.CLAIMED)
                .SetProperty(j => j.ClaimedBy, WorkerId)
                .SetProperty(j => j.ClaimedAtUtc, now), cancellationToken);
        var job = await db.ProcessingJobs.FirstOrDefaultAsync(j => j.Id == jobId, cancellationToken);
        if (job is null)
        {
            return MessageOutcome.Drop;
        }

        if (claimed == 0)
        {
            // Someone else holds it, or it is already submitted/done: this message has nothing left to do.
            return job.Status is MediaProcessingStatus.CLAIMED or MediaProcessingStatus.SUBMITTING ? MessageOutcome.Retry : MessageOutcome.Done;
        }

        var asset = await db.MediaAssets.FirstAsync(a => a.Id == job.MediaAssetId, cancellationToken);
        var group = await db.ContinuityGroups.Include(g => g.Recording).ThenInclude(r => r.Run).ThenInclude(r => r.Journal)
            .FirstAsync(g => g.Id == asset.ContinuityGroupId, cancellationToken);
        var segments = await db.Segments.Where(s => s.ContinuityGroupId == group.Id).OrderBy(s => s.SequenceNumber).ToListAsync(cancellationToken);
        if (segments.Count == 0 || segments.Any(s => s.UploadStatus != SegmentUploadStatus.VERIFIED || s.S3Key is null)
            || GroupReadiness.ManifestSha256(segments) != job.InputManifestSha256)
        {
            job.Status = MediaProcessingStatus.ERROR;
            job.LastErrorCode = "input_changed";
            job.LastErrorMessage = "The group's verified segments are not the set this job was made for.";
            asset.Status = MediaAssetStatus.FAILED;
            asset.FailureReason = job.LastErrorMessage;
            await db.SaveChangesAsync(cancellationToken);
            return MessageOutcome.Done;
        }

        var recording = group.Recording;
        var run = recording.Run;
        asset.OutputBucket = storage.PlaybackBucket;
        asset.OutputPrefix = EvidenceKeys.PlaybackAttempt(run.Journal.TransportRequestId, run.Id, recording.CameraId, recording.Id, group.Id,
            asset.ProfileVersion, job.Id);
        job.Status = MediaProcessingStatus.SUBMITTING;
        job.AttemptCount++;
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            // A previous attempt may have reached the provider before the crash: adopt it, never pay for a twin.
            var existing = job.AttemptCount > 1 ? await transcoder.FindAsync(job.Id, cancellationToken) : null;
            var providerJobId = existing?.ProviderJobId ?? await transcoder.SubmitAsync(new TranscodeRequest(
                job.Id, asset.Id, job.RequestToken, storage.RawBucket, segments.Select(s => s.S3Key!).ToList(),
                storage.PlaybackBucket, asset.OutputPrefix, asset.ProfileVersion, (int)Math.Round(recording.TargetFps),
                recording.Width, recording.Height, job.InputManifestSha256), cancellationToken);
            job.Provider = transcoder.Provider;
            job.ProviderJobId = providerJobId;
            job.Status = MediaProcessingStatus.SUBMITTED;
            job.SubmittedAtUtc = clock.GetUtcNow();
            job.LastErrorCode = job.LastErrorMessage = null;
            asset.Status = MediaAssetStatus.PROCESSING;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Evidence: transcode {Job} submitted as {ProviderJob} ({Count} segments, {Provider})", job.Id, providerJobId,
                segments.Count, transcoder.Provider);
            return MessageOutcome.Done;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            job.Status = job.AttemptCount >= 5 ? MediaProcessingStatus.ERROR : MediaProcessingStatus.RETRY_PENDING;
            job.LastErrorCode = "submit_failed";
            job.LastErrorMessage = ex.Message.Length <= 2000 ? ex.Message : ex.Message[..2000];
            if (job.Status == MediaProcessingStatus.ERROR)
            {
                asset.Status = MediaAssetStatus.FAILED;
                asset.FailureReason = "transcode submission failed 5 times";
            }

            await db.SaveChangesAsync(cancellationToken);
            logger.LogWarning(ex, "Evidence: transcode {Job} submission failed (attempt {Attempt})", job.Id, job.AttemptCount);
            return job.Status == MediaProcessingStatus.ERROR ? MessageOutcome.Done : MessageOutcome.Retry;
        }
    }
}
