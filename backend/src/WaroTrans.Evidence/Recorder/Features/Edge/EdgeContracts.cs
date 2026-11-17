using System.Text.Json;

namespace WaroTrans.Evidence.Recorder.Features.Edge;

// Contracts of the robot side (Edge agent → Recorder). All times are UTC from the robot's synced wall clock; monotonic
// stamps are only compared within one boot session.

public sealed record ActiveRunResponse(Guid RunId, Guid JournalId, Guid TransportRequestId, string RequestCode, Guid? SourceJobId, string? SourceJobNo, DateTimeOffset? StartedAtUtc);

/// <param name="EdgeRecordingKey">The robot's own id for the recording (made offline); the same key twice is one recording.</param>
/// <param name="JobStepId">The NAVIGATE's step the robot was driving when recording started, if any.</param>
public sealed record StartRecordingRequest(
    string EdgeRecordingKey,
    Guid? JobStepId,
    DateTimeOffset StartedAtUtc,
    Guid BootSessionId,
    string CameraId,
    string CameraModel,
    float? NominalFovDegrees,
    string? CameraCalibrationVersion,
    JsonElement? MountPose,
    int Width,
    int Height,
    float TargetFps,
    string SourceCodec,
    string CaptureSoftwareVersion);

public sealed record StartRecordingResponse(Guid RecordingId, Guid RunId, Guid JournalId, Guid TransportRequestId, string Status);

public sealed record SegmentIntent(
    Guid SegmentId,
    int SequenceNumber,
    DateTimeOffset CapturedFromUtc,
    DateTimeOffset CapturedToUtc,
    long StartMonotonicNs,
    long EndMonotonicNs,
    Guid BootSessionId,
    long DurationMs,
    int FrameCount,
    int DroppedFrameCount,
    int DuplicatedFrameCount,
    double? MaxSlotErrorMs,
    string ContainerFormat,
    string Codec,
    long ByteSize,
    string Sha256);

public sealed record RegisterSegmentsRequest(IReadOnlyList<SegmentIntent> Segments);

public sealed record RegisteredSegment(Guid SegmentId, int SequenceNumber, Guid ContinuityGroupId, int GroupOrdinal, string UploadStatus);

public sealed record RegisterSegmentsResponse(IReadOnlyList<RegisteredSegment> Segments);

public sealed record UploadGrantResponse(Guid SegmentId, string Key, string Url, string Method, IReadOnlyDictionary<string, string> Headers, DateTimeOffset ExpiresAtUtc);

/// <param name="Gaps">Holes the robot knows of (camera lost, reboot), for the timeline.</param>
public sealed record FinalizeRecordingRequest(DateTimeOffset EndedAtUtc, int ExpectedSegmentCount, IReadOnlyList<RecordingGap>? Gaps, string? Reason);

public sealed record RecordingGap(DateTimeOffset FromUtc, DateTimeOffset ToUtc, string Reason);

public sealed record FinalizeRecordingResponse(Guid RecordingId, string Status, int RegisteredSegments, int VerifiedSegments, int QueuedJobs);

public sealed record RecordingHeartbeatRequest(
    DateTimeOffset AtUtc,
    double? MeasuredFps,
    int? DroppedFrames,
    long? SpoolBytesUsed,
    long? SpoolBytesFree,
    int? PendingUploads,
    double? ClockErrorBoundMs,
    string? LastError);

public sealed record TrajectorySample(
    long SequenceNumber,
    DateTimeOffset CapturedAtUtc,
    double X,
    double Y,
    double YawRad,
    double? LinearVelocityMps,
    double? AngularVelocityRadps,
    string PoseSource,
    string FrameId,
    float? LocalizationQuality,
    bool IsValid,
    string? MapVersion);

public sealed record TrajectoryBatchRequest(IReadOnlyList<TrajectorySample> Points);

public sealed record RobotEvent(
    string SourceEventId,
    string EventType,
    string Category,
    string Severity,
    DateTimeOffset OccurredAtUtc,
    double? X,
    double? Y,
    string? Message,
    JsonElement? Payload);

public sealed record RobotEventsRequest(IReadOnlyList<RobotEvent> Events);

public sealed record PlanSnapshot(
    long PlanVersion,
    string? PlannerName,
    DateTimeOffset GeneratedAtUtc,
    string FrameId,
    string? MapVersion,
    IReadOnlyList<double[]> PathPoints,
    string? PathHash,
    string? Reason);

public sealed record PlanSnapshotsRequest(IReadOnlyList<PlanSnapshot> Plans);

public sealed record ClockAnchorSample(
    Guid BootSessionId,
    long MonotonicNs,
    DateTimeOffset UtcEstimate,
    string SyncSource,
    double? OffsetMs,
    double? ErrorBoundMs,
    bool Synchronized);

public sealed record ClockAnchorsRequest(IReadOnlyList<ClockAnchorSample> Anchors);

public sealed record BatchAccepted(int Accepted, int Duplicates);
