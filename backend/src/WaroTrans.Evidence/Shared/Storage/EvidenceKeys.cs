using System.Text.RegularExpressions;

namespace WaroTrans.Evidence.Storage;

/// <summary>
/// The only place S3 keys are made (spec §7.1). Keys are built from server-side IDs; nothing a client sends is used as
/// a path. The request id is only a namespace: the run, recording, group and segment ids make a key unique (a robot may
/// run the same request twice). Raw keys live under <c>raw/transport-requests/</c>, the only prefix the S3 → SQS
/// notification listens to, so playback output can never trigger ingest.
/// </summary>
public static partial class EvidenceKeys
{
    public const string RawPrefix = "raw/transport-requests/";
    public const string PlaybackPrefix = "playback/transport-requests/";
    public const string SegmentExtension = ".avi";

    [GeneratedRegex("^[a-z0-9][a-z0-9_-]{0,63}$")]
    private static partial Regex CameraIdPattern();

    [GeneratedRegex("^[a-z0-9][a-z0-9._-]{0,63}$")]
    private static partial Regex ProfilePattern();

    public static bool IsValidCameraId(string cameraId) => CameraIdPattern().IsMatch(cameraId);

    public static string RecordingPrefix(Guid transportRequestId, Guid journalId, Guid runId, string cameraId, Guid recordingId) =>
        $"{RawPrefix}{transportRequestId:D}/journal/{journalId:D}/runs/{runId:D}/cameras/{Camera(cameraId)}/recordings/{recordingId:D}/";

    public static string Segment(Guid transportRequestId, Guid journalId, Guid runId, string cameraId, Guid recordingId, int groupOrdinal, Guid segmentId) =>
        $"{RecordingPrefix(transportRequestId, journalId, runId, cameraId, recordingId)}group-{groupOrdinal}/segments/{segmentId:D}{SegmentExtension}";

    public static string TimingSidecar(Guid transportRequestId, Guid journalId, Guid runId, string cameraId, Guid recordingId, int groupOrdinal, Guid segmentId) =>
        $"{RecordingPrefix(transportRequestId, journalId, runId, cameraId, recordingId)}group-{groupOrdinal}/sidecars/{segmentId:D}.timing.json";

    /// <summary>Output folder of one transcode attempt: a retry never overwrites output that is already READY.</summary>
    public static string PlaybackAttempt(Guid transportRequestId, Guid runId, string cameraId, Guid recordingId, Guid groupId, string profileVersion, Guid processingJobId) =>
        $"{PlaybackPrefix}{transportRequestId:D}/runs/{runId:D}/cameras/{Camera(cameraId)}/recordings/{recordingId:D}/groups/{groupId:D}/profiles/{Profile(profileVersion)}/attempts/{processingJobId:N}/";

    /// <summary>The segment id in a raw segment key, or null when the key is not one (ingest ignores it).</summary>
    public static Guid? SegmentIdOf(string key)
    {
        if (!key.StartsWith(RawPrefix, StringComparison.Ordinal) || !key.EndsWith(SegmentExtension, StringComparison.Ordinal))
        {
            return null;
        }

        var slash = key.LastIndexOf('/');
        var name = key[(slash + 1)..^SegmentExtension.Length];
        return key[..slash].EndsWith("/segments", StringComparison.Ordinal) && Guid.TryParseExact(name, "D", out var id) ? id : null;
    }

    private static string Camera(string cameraId) =>
        IsValidCameraId(cameraId) ? cameraId : throw new ArgumentException($"Invalid camera id '{cameraId}'.", nameof(cameraId));

    private static string Profile(string profile) =>
        ProfilePattern().IsMatch(profile) ? profile : throw new ArgumentException($"Invalid profile '{profile}'.", nameof(profile));
}
