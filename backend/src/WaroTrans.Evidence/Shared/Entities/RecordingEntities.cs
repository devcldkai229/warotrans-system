using WaroTrans.Evidence.Enums;

namespace WaroTrans.Evidence.Entities;

/// <summary>One capture session of one camera during a run (spec §4.3). A camera reset or reboot starts another one.</summary>
public sealed class CameraRecording
{
    public Guid Id { get; set; }
    public Guid RobotRunEvidenceId { get; set; }
    public string CameraId { get; set; } = string.Empty;
    public string CameraModel { get; set; } = string.Empty;

    /// <summary>As the operator declared it (RBT-001 75°, RBT-002 120°); which axis is not asserted.</summary>
    public float? NominalFovDegrees { get; set; }

    public string? CameraCalibrationVersion { get; set; }

    /// <summary>Camera position/orientation in the base frame (jsonb), when calibrated.</summary>
    public string? MountPose { get; set; }

    public int Width { get; set; }
    public int Height { get; set; }
    public float TargetFps { get; set; }
    public string SourceCodec { get; set; } = "MJPEG";
    public string CaptureSoftwareVersion { get; set; } = string.Empty;
    public RecordingStatus Status { get; set; } = RecordingStatus.PENDING;

    /// <summary>The robot's own id for this recording (made before the backend was reachable).</summary>
    public string? EdgeRecordingKey { get; set; }

    public Guid? BootSessionId { get; set; }
    public DateTimeOffset StartedAtUtc { get; set; }
    public DateTimeOffset? EndedAtUtc { get; set; }
    public DateTimeOffset? LastHeartbeatAtUtc { get; set; }
    public DateTimeOffset? FinalizedAtUtc { get; set; }
    public int? ExpectedSegmentCount { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }

    public RobotRunEvidence Run { get; set; } = null!;
    public ICollection<RecordingContinuityGroup> Groups { get; set; } = [];
    public ICollection<VideoSegment> Segments { get; set; } = [];
}

/// <summary>Segments that play back to back with no hole (spec §4.4). A gap, reboot or clock jump starts a new group.</summary>
public sealed class RecordingContinuityGroup
{
    /// <summary>MediaConvert stitches at most 150 inputs per job.</summary>
    public const int MaxSegments = 150;

    public Guid Id { get; set; }
    public Guid RecordingId { get; set; }
    public int GroupOrdinal { get; set; }
    public DateTimeOffset CapturedFromUtc { get; set; }
    public DateTimeOffset? CapturedToUtc { get; set; }
    public int FirstSequenceNumber { get; set; }
    public int? LastSequenceNumber { get; set; }
    public int? ExpectedSegmentCount { get; set; }
    public ContinuityGroupStatus Status { get; set; } = ContinuityGroupStatus.OPEN;
    public ContinuityGapReason? GapReason { get; set; }
    public DateTimeOffset? FinalizedAtUtc { get; set; }

    public CameraRecording Recording { get; set; } = null!;
}

/// <summary>One original AVI/MOV file from the robot, not an HLS chunk (spec §4.5).</summary>
public sealed class VideoSegment
{
    /// <summary>Made by the robot before upload.</summary>
    public Guid Id { get; set; }

    public Guid RecordingId { get; set; }
    public Guid ContinuityGroupId { get; set; }
    public int SequenceNumber { get; set; }
    public DateTimeOffset CapturedFromUtc { get; set; }
    public DateTimeOffset CapturedToUtc { get; set; }
    public long StartMonotonicNs { get; set; }
    public long EndMonotonicNs { get; set; }
    public Guid BootSessionId { get; set; }
    public long DurationMs { get; set; }
    public int FrameCount { get; set; }
    public int DroppedFrameCount { get; set; }

    /// <summary>Frames repeated to keep the constant frame rate on the capture clock.</summary>
    public int DuplicatedFrameCount { get; set; }

    /// <summary>Largest gap between a slot's time and the capture time of the frame in it (from the timing sidecar).</summary>
    public double? MaxSlotErrorMs { get; set; }

    public string ContainerFormat { get; set; } = "AVI";
    public string Codec { get; set; } = "MJPEG";
    public long ByteSize { get; set; }

    /// <summary>Lowercase hex SHA-256 of the file, computed on the robot.</summary>
    public string Sha256 { get; set; } = string.Empty;

    public string? S3Bucket { get; set; }
    public string? S3Key { get; set; }
    public string? S3VersionId { get; set; }
    public string? S3ETag { get; set; }
    public SegmentUploadStatus UploadStatus { get; set; } = SegmentUploadStatus.REGISTERED;
    public string? UploadError { get; set; }
    public DateTimeOffset? UploadedAtUtc { get; set; }
    public DateTimeOffset? VerifiedAtUtc { get; set; }
    public int UploadAttemptCount { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }

    public CameraRecording Recording { get; set; } = null!;
    public RecordingContinuityGroup ContinuityGroup { get; set; } = null!;
}

/// <summary>
/// A robot's monotonic clock read together with its UTC estimate and the sync quality at that moment (spec §6.1):
/// the only way to compare monotonic stamps with UTC, and to say how uncertain a time is.
/// </summary>
public sealed class ClockAnchor
{
    public long Id { get; set; }
    public string RobotId { get; set; } = string.Empty;
    public Guid BootSessionId { get; set; }
    public long MonotonicNs { get; set; }
    public DateTimeOffset UtcEstimate { get; set; }

    /// <summary>chrony, ntp, none …</summary>
    public string SyncSource { get; set; } = string.Empty;

    public double? OffsetMs { get; set; }
    public double? ErrorBoundMs { get; set; }
    public bool Synchronized { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; }
}
