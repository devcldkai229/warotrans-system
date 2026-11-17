using WaroTrans.Evidence.Enums;

namespace WaroTrans.Evidence.Status;

/// <summary>
/// The allowed moves of each Evidence state machine (spec §5.2). Anything else is a bug or a stale/duplicate message
/// and is refused. A failed media asset is reprocessed as a new asset/attempt, never moved back.
/// </summary>
public static class StatusTransitions
{
    private static readonly Dictionary<SegmentUploadStatus, SegmentUploadStatus[]> Segment = new()
    {
        [SegmentUploadStatus.REGISTERED] = [SegmentUploadStatus.UPLOAD_PENDING, SegmentUploadStatus.UPLOADED, SegmentUploadStatus.FAILED],
        [SegmentUploadStatus.UPLOAD_PENDING] = [SegmentUploadStatus.UPLOADING, SegmentUploadStatus.UPLOADED, SegmentUploadStatus.FAILED, SegmentUploadStatus.QUARANTINED],
        [SegmentUploadStatus.UPLOADING] = [SegmentUploadStatus.UPLOADED, SegmentUploadStatus.FAILED, SegmentUploadStatus.QUARANTINED],
        [SegmentUploadStatus.UPLOADED] = [SegmentUploadStatus.VERIFIED, SegmentUploadStatus.FAILED, SegmentUploadStatus.QUARANTINED],
        // A failed upload gets a new grant and is tried again from the robot's spool.
        [SegmentUploadStatus.FAILED] = [SegmentUploadStatus.UPLOAD_PENDING],
        [SegmentUploadStatus.VERIFIED] = [],
        [SegmentUploadStatus.QUARANTINED] = []
    };

    private static readonly Dictionary<ContinuityGroupStatus, ContinuityGroupStatus[]> Group = new()
    {
        [ContinuityGroupStatus.OPEN] = [ContinuityGroupStatus.SEALED, ContinuityGroupStatus.INVALID],
        [ContinuityGroupStatus.SEALED] = [ContinuityGroupStatus.VERIFYING, ContinuityGroupStatus.READY_FOR_PROCESSING, ContinuityGroupStatus.PARTIAL, ContinuityGroupStatus.INVALID],
        [ContinuityGroupStatus.VERIFYING] = [ContinuityGroupStatus.READY_FOR_PROCESSING, ContinuityGroupStatus.PARTIAL, ContinuityGroupStatus.INVALID],
        [ContinuityGroupStatus.READY_FOR_PROCESSING] = [],
        [ContinuityGroupStatus.PARTIAL] = [],
        [ContinuityGroupStatus.INVALID] = []
    };

    private static readonly Dictionary<MediaAssetStatus, MediaAssetStatus[]> Asset = new()
    {
        [MediaAssetStatus.PENDING] = [MediaAssetStatus.QUEUED, MediaAssetStatus.FAILED],
        [MediaAssetStatus.QUEUED] = [MediaAssetStatus.PROCESSING, MediaAssetStatus.FAILED],
        [MediaAssetStatus.PROCESSING] = [MediaAssetStatus.READY, MediaAssetStatus.FAILED, MediaAssetStatus.PARTIAL],
        [MediaAssetStatus.READY] = [],
        [MediaAssetStatus.FAILED] = [],
        [MediaAssetStatus.PARTIAL] = []
    };

    private static readonly Dictionary<MediaProcessingStatus, MediaProcessingStatus[]> Job = new()
    {
        // CLAIMED → QUEUED: the claim's lease ran out (the worker died before submitting).
        [MediaProcessingStatus.QUEUED] = [MediaProcessingStatus.CLAIMED, MediaProcessingStatus.CANCELED],
        [MediaProcessingStatus.CLAIMED] = [MediaProcessingStatus.SUBMITTING, MediaProcessingStatus.QUEUED],
        [MediaProcessingStatus.SUBMITTING] = [MediaProcessingStatus.SUBMITTED, MediaProcessingStatus.RETRY_PENDING, MediaProcessingStatus.ERROR],
        [MediaProcessingStatus.RETRY_PENDING] = [MediaProcessingStatus.CLAIMED, MediaProcessingStatus.SUBMITTED, MediaProcessingStatus.ERROR],
        // The completion event may come before any progress event.
        [MediaProcessingStatus.SUBMITTED] = [MediaProcessingStatus.PROGRESSING, MediaProcessingStatus.COMPLETE, MediaProcessingStatus.ERROR, MediaProcessingStatus.CANCELED],
        [MediaProcessingStatus.PROGRESSING] = [MediaProcessingStatus.COMPLETE, MediaProcessingStatus.ERROR, MediaProcessingStatus.CANCELED],
        [MediaProcessingStatus.COMPLETE] = [],
        [MediaProcessingStatus.ERROR] = [],
        [MediaProcessingStatus.CANCELED] = []
    };

    private static readonly Dictionary<RecordingStatus, RecordingStatus[]> Recording = new()
    {
        [RecordingStatus.PENDING] = [RecordingStatus.RECORDING, RecordingStatus.FAILED],
        [RecordingStatus.RECORDING] = [RecordingStatus.FINALIZING, RecordingStatus.PARTIAL, RecordingStatus.FAILED],
        [RecordingStatus.FINALIZING] = [RecordingStatus.UPLOADING, RecordingStatus.READY, RecordingStatus.PARTIAL, RecordingStatus.FAILED],
        [RecordingStatus.UPLOADING] = [RecordingStatus.READY, RecordingStatus.PARTIAL, RecordingStatus.FAILED],
        [RecordingStatus.READY] = [],
        [RecordingStatus.PARTIAL] = [],
        [RecordingStatus.FAILED] = []
    };

    public static bool CanMove(SegmentUploadStatus from, SegmentUploadStatus to) => Segment[from].Contains(to);
    public static bool CanMove(ContinuityGroupStatus from, ContinuityGroupStatus to) => Group[from].Contains(to);
    public static bool CanMove(MediaAssetStatus from, MediaAssetStatus to) => Asset[from].Contains(to);
    public static bool CanMove(MediaProcessingStatus from, MediaProcessingStatus to) => Job[from].Contains(to);
    public static bool CanMove(RecordingStatus from, RecordingStatus to) => Recording[from].Contains(to);

    public static bool IsTerminal(MediaProcessingStatus status) => Job[status].Length == 0;
    public static bool IsTerminal(RecordingStatus status) => Recording[status].Length == 0;
    public static bool IsTerminal(SegmentUploadStatus status) => Segment[status].Length == 0;

    public static T Move<T>(T from, T to, Func<T, T, bool> canMove) where T : struct, Enum =>
        canMove(from, to) ? to : throw new InvalidOperationException($"{typeof(T).Name}: {from} → {to} is not allowed.");
}
