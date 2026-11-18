namespace WaroTrans.Evidence.Media;

/// <summary>
/// Turns one continuity group's original segments into HLS (spec §9.4). AWS: Elemental MediaConvert (the Worker only
/// orchestrates; it never encodes). Local (tests, offline dev): ffmpeg on the Worker's machine.
/// </summary>
public interface IMediaTranscoder
{
    string Provider { get; }

    /// <summary>Submits the job; returns the provider's job id. Must be safe to call again with the same token.</summary>
    Task<string> SubmitAsync(TranscodeRequest request, CancellationToken cancellationToken);

    /// <summary>A job already submitted for this processing job (crash after submit, before the id was saved).</summary>
    Task<ProviderJob?> FindAsync(Guid processingJobId, CancellationToken cancellationToken);

    Task<ProviderJob?> GetAsync(string providerJobId, CancellationToken cancellationToken);
}

/// <param name="InputKeys">Segment objects in sequence order (never in notification order).</param>
/// <param name="OutputPrefix">Folder of this attempt; a retry never overwrites output that is already READY.</param>
public sealed record TranscodeRequest(
    Guid ProcessingJobId,
    Guid MediaAssetId,
    string RequestToken,
    string InputBucket,
    IReadOnlyList<string> InputKeys,
    string OutputBucket,
    string OutputPrefix,
    string ProfileVersion,
    int Fps,
    int Width,
    int Height,
    string InputManifestSha256);

public static class ProviderJobStatus
{
    public const string Submitted = "SUBMITTED";
    public const string Progressing = "PROGRESSING";
    public const string Complete = "COMPLETE";
    public const string Error = "ERROR";
    public const string Canceled = "CANCELED";
}

public sealed record ProviderJob(
    string ProviderJobId,
    string Status,
    Guid? ProcessingJobId,
    string? ErrorCode,
    string? ErrorMessage,
    long? OutputDurationMs);

/// <summary>A job state change, from EventBridge (AWS) or from the local transcoder, as put on the media-result queue.</summary>
public sealed record MediaJobStateChange(string ProviderJobId, string Status, Guid? ProcessingJobId, string? ErrorCode, string? ErrorMessage, long? OutputDurationMs);

public sealed class EvidenceMediaOptions
{
    public const string SectionName = "Evidence:Media";

    /// <summary>MediaConvert, Local (ffmpeg) or None (nothing is transcoded; jobs wait).</summary>
    public string Provider { get; set; } = "None";

    public string Region { get; set; } = "ap-southeast-1";
    public string? MediaConvertQueueArn { get; set; }
    public string? MediaConvertRoleArn { get; set; }

    /// <summary>Optional account endpoint (older accounts); empty: the regional endpoint.</summary>
    public string? MediaConvertEndpoint { get; set; }

    public string FfmpegPath { get; set; } = "ffmpeg";

    /// <summary>HLS chunk length (s), the playback unit (the 30 s raw segment is only the durability unit).</summary>
    public int HlsSegmentSeconds { get; set; } = 6;

    /// <summary>A job SUBMITTED/PROGRESSING this long without news is asked about directly (lost event).</summary>
    public int StaleJobMinutes { get; set; } = 30;
}
