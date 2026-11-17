using WaroTrans.Evidence.Enums;

namespace WaroTrans.Evidence.Entities;

/// <summary>Where the robot really was, in the map frame (spec §4.6). Invalid samples are kept: they mark a gap.</summary>
public sealed class TrajectoryPoint
{
    public long Id { get; set; }
    public Guid RobotRunEvidenceId { get; set; }
    public long SequenceNumber { get; set; }
    public DateTimeOffset CapturedAtUtc { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public double YawRad { get; set; }
    public double? LinearVelocityMps { get; set; }
    public double? AngularVelocityRadps { get; set; }
    public string PoseSource { get; set; } = string.Empty;
    public string FrameId { get; set; } = "map";

    /// <summary>Only a metric the robot defines; never made up.</summary>
    public float? LocalizationQuality { get; set; }

    public bool IsValid { get; set; }
    public string? MapVersion { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; }
}

/// <summary>The path the planner meant to take at a time, kept for every replan (spec §4.7).</summary>
public sealed class RoutePlanSnapshot
{
    public const int MaxPoints = 500;

    public Guid Id { get; set; }
    public Guid RobotRunEvidenceId { get; set; }
    public long PlanVersion { get; set; }
    public string? PlannerName { get; set; }
    public DateTimeOffset GeneratedAtUtc { get; set; }
    public DateTimeOffset? ValidUntilUtc { get; set; }
    public string FrameId { get; set; } = "map";
    public string? MapVersion { get; set; }

    /// <summary>Ordered [[x,y],…] (jsonb), at most <see cref="MaxPoints"/>.</summary>
    public string PathPoints { get; set; } = "[]";

    public string? PathHash { get; set; }
    public string? Reason { get; set; }
}

/// <summary>An HLS rendition set made from one continuity group (spec §4.9).</summary>
public sealed class MediaAsset
{
    public Guid Id { get; set; }
    public Guid RecordingId { get; set; }
    public Guid ContinuityGroupId { get; set; }
    public string ProfileVersion { get; set; } = string.Empty;
    public MediaAssetStatus Status { get; set; } = MediaAssetStatus.PENDING;
    public string? OutputBucket { get; set; }
    public string? OutputPrefix { get; set; }
    public string? MasterPlaylistKey { get; set; }
    public string? ThumbnailKey { get; set; }
    public long? DurationMs { get; set; }

    /// <summary>[{name,width,height,fps,bitrate,playlistKey}] (jsonb).</summary>
    public string Renditions { get; set; } = "[]";

    public string? FailureReason { get; set; }
    public DateTimeOffset? ReadyAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
}

/// <summary>One transcode job at the provider (spec §4.10).</summary>
public sealed class MediaProcessingJob
{
    public const string MediaConvert = "AWS_MEDIACONVERT";

    public Guid Id { get; set; }
    public Guid MediaAssetId { get; set; }
    public string Provider { get; set; } = MediaConvert;
    public string? ProviderJobId { get; set; }

    /// <summary>Deterministic client request token (only dedupes about one minute at AWS).</summary>
    public string RequestToken { get; set; } = string.Empty;

    public string InputManifestSha256 { get; set; } = string.Empty;
    public string JobTemplateVersion { get; set; } = string.Empty;
    public MediaProcessingStatus Status { get; set; } = MediaProcessingStatus.QUEUED;
    public int AttemptCount { get; set; }
    public string? ClaimedBy { get; set; }
    public DateTimeOffset? ClaimedAtUtc { get; set; }
    public string? LastErrorCode { get; set; }
    public string? LastErrorMessage { get; set; }
    public DateTimeOffset? SubmittedAtUtc { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
}

/// <summary>Capture UTC ↔ playback time of an asset, measured, not assumed (spec §4.11).</summary>
public sealed class PlaybackSpan
{
    public Guid Id { get; set; }
    public Guid MediaAssetId { get; set; }
    public Guid RecordingId { get; set; }
    public DateTimeOffset UtcStart { get; set; }
    public DateTimeOffset UtcEnd { get; set; }
    public long MediaStartMs { get; set; }
    public long MediaEndMs { get; set; }
    public float? TimeErrorBoundMs { get; set; }

    /// <summary>CFR_SLOT_V1: constant-rate slots on the capture clock.</summary>
    public string MappingMethod { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }
}
