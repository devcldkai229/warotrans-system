using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Media;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Processing;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Status;
using WaroTrans.Evidence.Storage;
using WaroTrans.Evidence.Worker.Services;

namespace WaroTrans.Evidence.Worker.Features.MediaConvertResult;

/// <summary>
/// media-result: a transcode changed state (spec §9.4). COMPLETE is not trusted as such: the master and rendition
/// playlists are read back, their chunks checked, and only then are the PlaybackSpans written and the asset READY.
/// An event can arrive before the job's provider id was saved: it is retried, then looked up directly.
/// </summary>
public sealed class MediaResultHandler(
    EvidenceDbContext db,
    IObjectStore store,
    TimeProvider clock,
    ILogger<MediaResultHandler> logger) : IQueueMessageHandler
{
    public string Queue => EvidenceQueues.MediaResult;

    public async Task<MessageOutcome> HandleAsync(QueueMessage message, CancellationToken cancellationToken)
    {
        var change = MediaJobEvents.Parse(message.Body);
        if (change is null)
        {
            return MessageOutcome.Drop;
        }

        var job = await db.ProcessingJobs.FirstOrDefaultAsync(j => j.ProviderJobId == change.ProviderJobId
                                                                   || (change.ProcessingJobId != null && j.Id == change.ProcessingJobId), cancellationToken);
        if (job is null)
        {
            // Not ours, or the submit's save has not landed yet: wait a little, then drop it (reconciliation still asks).
            return message.ReceiveCount >= 5 ? MessageOutcome.Drop : MessageOutcome.Retry;
        }

        job.ProviderJobId ??= change.ProviderJobId;
        return await ApplyAsync(job, change, cancellationToken);
    }

    /// <summary>Also used by reconciliation with what GetJob returned.</summary>
    public async Task<MessageOutcome> ApplyAsync(MediaProcessingJob job, MediaJobStateChange change, CancellationToken cancellationToken)
    {
        if (StatusTransitions.IsTerminal(job.Status))
        {
            return MessageOutcome.Done; // duplicate or late event
        }

        var asset = await db.MediaAssets.FirstAsync(a => a.Id == job.MediaAssetId, cancellationToken);
        var now = clock.GetUtcNow();
        switch (change.Status)
        {
            case ProviderJobStatus.Progressing:
                if (job.Status is MediaProcessingStatus.SUBMITTED or MediaProcessingStatus.SUBMITTING or MediaProcessingStatus.CLAIMED)
                {
                    job.Status = MediaProcessingStatus.PROGRESSING;
                }

                break;
            case ProviderJobStatus.Complete:
                var problem = await VerifyAndMapAsync(job, asset, change.OutputDurationMs, now, cancellationToken);
                if (problem is null)
                {
                    job.Status = MediaProcessingStatus.COMPLETE;
                    job.CompletedAtUtc = now;
                }
                else
                {
                    job.Status = MediaProcessingStatus.ERROR;
                    job.LastErrorCode = "output_invalid";
                    job.LastErrorMessage = problem;
                    job.CompletedAtUtc = now;
                    asset.Status = MediaAssetStatus.FAILED;
                    asset.FailureReason = problem;
                }

                break;
            case ProviderJobStatus.Error:
            case ProviderJobStatus.Canceled:
                job.Status = change.Status == ProviderJobStatus.Error ? MediaProcessingStatus.ERROR : MediaProcessingStatus.CANCELED;
                job.LastErrorCode = Bounded(change.ErrorCode, 64);
                job.LastErrorMessage = Bounded(change.ErrorMessage, 2000);
                job.CompletedAtUtc = now;
                asset.Status = MediaAssetStatus.FAILED;
                asset.FailureReason = Bounded($"{change.Status}: {change.ErrorCode} {change.ErrorMessage}", 500);
                break;
            default:
                return MessageOutcome.Done;
        }

        await db.SaveChangesAsync(cancellationToken);
        await RecordingReadiness.UpdateAsync(db, asset.RecordingId, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Evidence: transcode {Job} {Status} (asset {Asset} {AssetStatus})", job.Id, job.Status, asset.Id, asset.Status);
        return MessageOutcome.Done;
    }

    /// <returns>Why the output cannot be played, or null when it is READY (spans written).</returns>
    private async Task<string?> VerifyAndMapAsync(MediaProcessingJob job, MediaAsset asset, long? reportedDurationMs, DateTimeOffset now, CancellationToken ct)
    {
        var masterKey = asset.OutputPrefix + "master.m3u8";
        var master = await ReadTextAsync(masterKey, asset.OutputBucket, ct);
        if (master is null)
        {
            return "master playlist missing";
        }

        var variants = HlsPlaylists.ParseMaster(master);
        if (variants.Count == 0)
        {
            return "master playlist lists no rendition";
        }

        var renditions = new List<object>();
        double? playable = null;
        foreach (var variant in variants)
        {
            var playlistKey = HlsPlaylists.Resolve(masterKey, variant.Uri);
            var text = await ReadTextAsync(playlistKey, asset.OutputBucket, ct);
            if (text is null)
            {
                return $"rendition playlist {variant.Uri} missing";
            }

            var media = HlsPlaylists.ParseMedia(text);
            if (media.Segments.Count == 0 || !media.Ended)
            {
                return $"rendition {variant.Uri} is empty or not finished";
            }

            foreach (var chunk in new[] { media.Segments[0], media.Segments[^1] }.Distinct())
            {
                if (await store.HeadAsync(HlsPlaylists.Resolve(playlistKey, chunk), ct, asset.OutputBucket) is not { Size: > 0 })
                {
                    return $"chunk {chunk} of {variant.Uri} missing";
                }
            }

            playable = playable is null ? media.DurationSeconds : Math.Min(playable.Value, media.DurationSeconds);
            renditions.Add(new { name = variant.Uri, variant.Width, variant.Height, variant.Bandwidth, playlistKey, durationSeconds = media.DurationSeconds });
        }

        var recording = await db.Recordings.Include(r => r.Run).FirstAsync(r => r.Id == asset.RecordingId, ct);
        var segments = await db.Segments.Where(s => s.ContinuityGroupId == asset.ContinuityGroupId).ToListAsync(ct);
        var measured = (long?)Math.Round((playable ?? 0) * 1000) ?? reportedDurationMs;
        var mapping = PlaybackSpanBuilder.Build(asset.Id, asset.RecordingId, segments, recording.TargetFps,
            recording.Run.TimeSyncErrorBoundMs, measured, now);
        await db.PlaybackSpans.Where(s => s.MediaAssetId == asset.Id).ExecuteDeleteAsync(ct);
        db.PlaybackSpans.AddRange(mapping.Spans);
        asset.MasterPlaylistKey = masterKey;
        asset.DurationMs = measured;
        asset.Renditions = JsonSerializer.Serialize(renditions, GroupReadiness.Json);
        asset.Status = MediaAssetStatus.READY;
        asset.ReadyAtUtc = now;
        if (!mapping.Verified)
        {
            logger.LogWarning("Evidence: asset {Asset} plays {Measured} ms, frames say {Expected} ms: mapping marked unverified",
                asset.Id, measured, mapping.ExpectedDurationMs);
        }

        return null;
    }

    private async Task<string?> ReadTextAsync(string key, string? bucket, CancellationToken ct)
    {
        await using var stream = await store.OpenReadAsync(key, ct, bucket);
        if (stream is null)
        {
            return null;
        }

        using var reader = new StreamReader(stream, Encoding.UTF8);
        return await reader.ReadToEndAsync(ct);
    }

    private static string? Bounded(string? text, int max) => text is null ? null : text.Length <= max ? text : text[..max];
}

/// <summary>A recording is READY when each of its groups has a READY asset, PARTIAL when evidence is known to be missing.</summary>
public static class RecordingReadiness
{
    public static async Task UpdateAsync(EvidenceDbContext db, Guid recordingId, CancellationToken ct)
    {
        var recording = await db.Recordings.FirstAsync(r => r.Id == recordingId, ct);
        if (recording.FinalizedAtUtc is null || StatusTransitions.IsTerminal(recording.Status))
        {
            return;
        }

        var groups = await db.ContinuityGroups.Where(g => g.RecordingId == recordingId).ToListAsync(ct);
        var assets = await db.MediaAssets.Where(a => a.RecordingId == recordingId).ToListAsync(ct);
        var processable = groups.Where(g => g.Status is not (ContinuityGroupStatus.PARTIAL or ContinuityGroupStatus.INVALID)).ToList();
        var missing = groups.Count(g => g.Status is ContinuityGroupStatus.PARTIAL or ContinuityGroupStatus.INVALID);
        var allReady = processable.Count > 0 && processable.All(g => assets.Any(a => a.ContinuityGroupId == g.Id && a.Status == MediaAssetStatus.READY));
        var anyFailed = assets.Any(a => a.Status == MediaAssetStatus.FAILED);
        var anyPending = processable.Any(g => !assets.Any(a => a.ContinuityGroupId == g.Id && a.Status is MediaAssetStatus.READY or MediaAssetStatus.FAILED));
        if (anyPending)
        {
            return;
        }

        var next = allReady && missing == 0 ? RecordingStatus.READY : RecordingStatus.PARTIAL;
        if (anyFailed && !assets.Any(a => a.Status == MediaAssetStatus.READY))
        {
            next = RecordingStatus.FAILED;
        }

        if (recording.Status == RecordingStatus.FINALIZING && StatusTransitions.CanMove(RecordingStatus.FINALIZING, next))
        {
            recording.Status = next;
        }
        else if (StatusTransitions.CanMove(recording.Status, next))
        {
            recording.Status = next;
        }
    }
}
