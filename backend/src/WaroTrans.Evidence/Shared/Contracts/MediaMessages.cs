namespace WaroTrans.Evidence.Contracts;

/// <summary>
/// Outbox → media-process queue (spec §8.2): a continuity group is sealed and all its segments are verified, transcode
/// it. Idempotency key: (ContinuityGroupId, ProfileVersion, InputManifestSha256).
/// </summary>
public sealed record MediaProcessRequested(
    int SchemaVersion,
    Guid EventId,
    string EventType,
    DateTimeOffset OccurredAtUtc,
    Guid JournalId,
    Guid EvidenceRunId,
    Guid RecordingId,
    Guid ContinuityGroupId,
    Guid MediaAssetId,
    Guid MediaProcessingJobId,
    string InputManifestSha256,
    string ProfileVersion,
    string? CorrelationId)
{
    public const string Type = "evidence.media-processing.requested";
}

public static class MediaProfiles
{
    /// <summary>H.264 HLS 720p + 480p, 4–6 s chunks, source frame rate kept (Terraform job template hls-v1).</summary>
    public const string HlsV1 = "hls-v1";
}
