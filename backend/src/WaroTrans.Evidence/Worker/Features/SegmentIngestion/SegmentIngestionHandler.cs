using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;
using WaroTrans.Evidence.Processing;
using WaroTrans.Evidence.Queues;
using WaroTrans.Evidence.Storage;
using WaroTrans.Evidence.Worker.Services;

namespace WaroTrans.Evidence.Worker.Features.SegmentIngestion;

/// <summary>
/// An original segment landed in the raw bucket (S3 ObjectCreated, at least once, any order). The event alone proves
/// nothing (spec §7.2): the object is matched to its registered intent and checked in storage (size and SHA-256)
/// before the segment counts as VERIFIED; a mismatch is QUARANTINED and never transcoded.
/// </summary>
public sealed class SegmentIngestionHandler(
    EvidenceDbContext db,
    IObjectStore store,
    TimeProvider clock,
    ILogger<SegmentIngestionHandler> logger) : IQueueMessageHandler
{
    /// <summary>An object with no intent after this many receives is somebody else's file: dropped (logged).</summary>
    public const int MaxReceivesWithoutIntent = 5;

    public string Queue => EvidenceQueues.SegmentIngest;

    public async Task<MessageOutcome> HandleAsync(QueueMessage message, CancellationToken cancellationToken)
    {
        var results = new List<MessageOutcome>();
        foreach (var record in S3Events.Parse(message.Body))
        {
            if (EvidenceKeys.SegmentIdOf(record.Key) is not { } segmentId)
            {
                continue; // not a raw segment (sidecar, playback output): not ours to ingest
            }

            results.Add(await VerifyAsync(segmentId, record.Key, message.ReceiveCount, cancellationToken));
        }

        // One record still waiting keeps the whole message; only records nobody can ever use make it a drop.
        return results.Contains(MessageOutcome.Retry) ? MessageOutcome.Retry
            : results.Count > 0 && results.All(r => r == MessageOutcome.Drop) ? MessageOutcome.Drop
            : MessageOutcome.Done;
    }

    /// <summary>Also used by reconciliation for objects whose notification never came.</summary>
    public async Task<MessageOutcome> VerifyAsync(Guid segmentId, string key, int receiveCount, CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();
        var segment = await db.Segments.FirstOrDefaultAsync(s => s.Id == segmentId, cancellationToken);
        if (segment is null)
        {
            // The event can arrive before the intent's commit: wait, then give up on a stranger's file.
            if (receiveCount >= MaxReceivesWithoutIntent)
            {
                logger.LogWarning("Evidence: object {Key} has no registered segment; ignored", key);
                return MessageOutcome.Drop;
            }

            return MessageOutcome.Retry;
        }

        if (segment.UploadStatus is SegmentUploadStatus.VERIFIED or SegmentUploadStatus.QUARANTINED)
        {
            return MessageOutcome.Done; // duplicate notification
        }

        var now = clock.GetUtcNow();
        if (segment.S3Key is not null && segment.S3Key != key)
        {
            await QuarantineAsync(segment, $"uploaded to {key}, granted {segment.S3Key}", now, cancellationToken);
            return MessageOutcome.Done;
        }

        var head = await store.HeadAsync(key, cancellationToken);
        if (head is null)
        {
            return MessageOutcome.Retry; // listed before it is readable (or deleted): look again later
        }

        var sha = head.Sha256Hex;
        if (sha is null)
        {
            // No stored checksum (an upload without the header): hash the object itself.
            await using var stream = await store.OpenReadAsync(key, cancellationToken);
            sha = stream is null ? null : await Checksums.Sha256HexAsync(stream, cancellationToken);
        }

        segment.S3Bucket ??= head.Bucket;
        segment.S3Key ??= key;
        segment.S3ETag = head.ETag;
        segment.S3VersionId = head.VersionId;
        segment.UploadedAtUtc ??= head.LastModifiedUtc;
        if (head.Size != segment.ByteSize || !string.Equals(sha, segment.Sha256, StringComparison.Ordinal))
        {
            await QuarantineAsync(segment, $"stored {head.Size} B sha {sha?[..12]}…, registered {segment.ByteSize} B sha {segment.Sha256[..12]}…", now, cancellationToken);
            return MessageOutcome.Done;
        }

        segment.UploadStatus = SegmentUploadStatus.VERIFIED;
        segment.VerifiedAtUtc = now;
        segment.UploadError = null;
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await GroupReadiness.EvaluateAsync(db, segment.ContinuityGroupId, now, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return MessageOutcome.Done;
    }

    private async Task QuarantineAsync(VideoSegment segment, string why, DateTimeOffset now, CancellationToken cancellationToken)
    {
        segment.UploadStatus = SegmentUploadStatus.QUARANTINED;
        segment.UploadError = why.Length <= 500 ? why : why[..500];
        var recording = await db.Recordings.Include(r => r.Run).FirstAsync(r => r.Id == segment.RecordingId, cancellationToken);
        db.Events.Add(new EvidenceEvent
        {
            Id = Guid.NewGuid(),
            JournalId = recording.Run.JournalId,
            RobotRunEvidenceId = recording.RobotRunEvidenceId,
            SourceSystem = "evidence-worker",
            SourceEventId = $"quarantine:{segment.Id:N}",
            Category = EvidenceEventCategory.RECORDING,
            EventType = "segment.quarantined",
            Severity = EvidenceSeverity.ERROR,
            OccurredAtUtc = segment.CapturedFromUtc,
            ReceivedAtUtc = now,
            Message = $"Video segment {segment.SequenceNumber} of {recording.CameraId} does not match what the robot registered",
            Payload = System.Text.Json.JsonSerializer.Serialize(new { segment.Id, segment.SequenceNumber, reason = segment.UploadError }),
            CorrelationId = recording.Run.SourceJobNo,
            PayloadSchemaVersion = 1
        });
        logger.LogWarning("Evidence: segment {Segment} quarantined: {Why}", segment.Id, why);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await GroupReadiness.EvaluateAsync(db, segment.ContinuityGroupId, now, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }
}
