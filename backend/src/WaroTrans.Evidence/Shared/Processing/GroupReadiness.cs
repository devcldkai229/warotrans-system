using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.Evidence.Contracts;
using WaroTrans.Evidence.Entities;
using WaroTrans.Evidence.Enums;
using WaroTrans.Evidence.Persistence;

namespace WaroTrans.Evidence.Processing;

/// <summary>
/// Decides when a continuity group can be transcoded (spec §8.5): it must be sealed (its last segment is known) and
/// every segment verified in storage. Then the media asset, its processing job and the outbox message are written in
/// the caller's transaction, once: the unique key (group, profile) and (asset, manifest, template) stop a second one,
/// whichever of the Recorder (finalize) or the Worker (last segment verified) gets there.
/// <para>
/// A quarantined segment leaves a hole: the group is split into its runs of good, consecutive segments (each its own
/// group, processed alone) and is itself marked PARTIAL, so the replay shows the hole instead of playing over it.
/// </para>
/// </summary>
public static class GroupReadiness
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <returns>The processing jobs queued by this call (empty when not ready or already queued).</returns>
    public static async Task<IReadOnlyList<MediaProcessingJob>> EvaluateAsync(
        EvidenceDbContext db, Guid groupId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var group = await db.ContinuityGroups.Include(g => g.Recording).ThenInclude(r => r.Run)
            .FirstOrDefaultAsync(g => g.Id == groupId, cancellationToken);
        if (group is null || group.Status is not (ContinuityGroupStatus.SEALED or ContinuityGroupStatus.VERIFYING))
        {
            return [];
        }

        var segments = await db.Segments.Where(s => s.ContinuityGroupId == groupId).OrderBy(s => s.SequenceNumber).ToListAsync(cancellationToken);
        if (segments.Count == 0 || (group.ExpectedSegmentCount is { } expected && segments.Count < expected))
        {
            group.Status = ContinuityGroupStatus.VERIFYING;
            return [];
        }

        if (segments.Any(s => s.UploadStatus is not (SegmentUploadStatus.VERIFIED or SegmentUploadStatus.QUARANTINED)))
        {
            group.Status = ContinuityGroupStatus.VERIFYING;
            return [];
        }

        if (segments.All(s => s.UploadStatus == SegmentUploadStatus.VERIFIED))
        {
            group.Status = ContinuityGroupStatus.READY_FOR_PROCESSING;
            group.FinalizedAtUtc ??= now;
            return await QueueAsync(db, group, segments, now, cancellationToken) is { } job ? [job] : [];
        }

        return await SplitAroundHolesAsync(db, group, segments, now, cancellationToken);
    }

    private static async Task<IReadOnlyList<MediaProcessingJob>> SplitAroundHolesAsync(
        EvidenceDbContext db, RecordingContinuityGroup group, List<VideoSegment> segments, DateTimeOffset now, CancellationToken cancellationToken)
    {
        group.Status = ContinuityGroupStatus.PARTIAL;
        group.FinalizedAtUtc ??= now;
        var runs = new List<List<VideoSegment>>();
        foreach (var segment in segments)
        {
            if (segment.UploadStatus != SegmentUploadStatus.VERIFIED)
            {
                runs.Add([]);
                continue;
            }

            if (runs.Count == 0 || (runs[^1].Count > 0 && runs[^1][^1].SequenceNumber + 1 != segment.SequenceNumber))
            {
                runs.Add([]);
            }

            runs[^1].Add(segment);
        }

        var nextOrdinal = await db.ContinuityGroups.Where(g => g.RecordingId == group.RecordingId).MaxAsync(g => g.GroupOrdinal, cancellationToken) + 1;
        var jobs = new List<MediaProcessingJob>();
        foreach (var run in runs.Where(r => r.Count > 0))
        {
            var part = new RecordingContinuityGroup
            {
                Id = Guid.NewGuid(),
                RecordingId = group.RecordingId,
                Recording = group.Recording,
                GroupOrdinal = nextOrdinal++,
                CapturedFromUtc = run[0].CapturedFromUtc,
                CapturedToUtc = run[^1].CapturedToUtc,
                FirstSequenceNumber = run[0].SequenceNumber,
                LastSequenceNumber = run[^1].SequenceNumber,
                ExpectedSegmentCount = run.Count,
                Status = ContinuityGroupStatus.READY_FOR_PROCESSING,
                GapReason = ContinuityGapReason.FRAME_GAP,
                FinalizedAtUtc = now
            };
            db.ContinuityGroups.Add(part);
            foreach (var segment in run)
            {
                segment.ContinuityGroupId = part.Id;
            }

            if (await QueueAsync(db, part, run, now, cancellationToken) is { } job)
            {
                jobs.Add(job);
            }
        }

        return jobs;
    }

    private static async Task<MediaProcessingJob?> QueueAsync(
        EvidenceDbContext db, RecordingContinuityGroup group, IReadOnlyList<VideoSegment> segments, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var profile = MediaProfiles.HlsV1;
        if (await db.MediaAssets.AnyAsync(a => a.ContinuityGroupId == group.Id && a.ProfileVersion == profile, cancellationToken)
            || db.MediaAssets.Local.Any(a => a.ContinuityGroupId == group.Id && a.ProfileVersion == profile))
        {
            return null;
        }

        var manifest = ManifestSha256(segments);
        var asset = new MediaAsset
        {
            Id = Guid.NewGuid(),
            RecordingId = group.RecordingId,
            ContinuityGroupId = group.Id,
            ProfileVersion = profile,
            Status = MediaAssetStatus.QUEUED,
            CreatedAtUtc = now
        };
        var job = new MediaProcessingJob
        {
            Id = Guid.NewGuid(),
            MediaAssetId = asset.Id,
            InputManifestSha256 = manifest,
            JobTemplateVersion = profile,
            Status = MediaProcessingStatus.QUEUED,
            CreatedAtUtc = now
        };
        job.RequestToken = job.Id.ToString("N");
        db.MediaAssets.Add(asset);
        db.ProcessingJobs.Add(job);
        var run = group.Recording.Run;
        var message = new MediaProcessRequested(1, Guid.NewGuid(), MediaProcessRequested.Type, now, run.JournalId, run.Id,
            group.RecordingId, group.Id, asset.Id, job.Id, manifest, profile, run.SourceJobNo);
        db.Outbox.Add(new EvidenceOutbox
        {
            Id = message.EventId,
            EventType = MediaProcessRequested.Type,
            Payload = JsonSerializer.Serialize(message, Json),
            CreatedAtUtc = now
        });
        return job;
    }

    /// <summary>SHA-256 over the ordered (sequence, file SHA-256) list: a changed segment set is a different input.</summary>
    public static string ManifestSha256(IEnumerable<VideoSegment> segments) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(
            string.Join("\n", segments.OrderBy(s => s.SequenceNumber).Select(s => $"{s.SequenceNumber}:{s.Sha256}")))));
}
