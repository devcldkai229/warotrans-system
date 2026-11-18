namespace WaroTrans.Evidence.Enums;

// Evidence-owned statuses (spec §5.1). They describe how complete the *evidence* is, never the delivery: the transport
// status is kept verbatim in the *StatusSnapshot columns and is not mapped onto these. Stored as strings.

/// <summary>How complete the evidence of a whole Transport Request is.</summary>
public enum EvidenceJournalStatus
{
    /// <summary>A run is still going on (or none has started).</summary>
    OPEN,

    /// <summary>Every run has ended; media or uploads are still being taken in.</summary>
    FINALIZING,

    /// <summary>Every known run has the evidence the recording policy asks for.</summary>
    FINALIZED,

    /// <summary>Every run has ended and some evidence is known to be missing.</summary>
    PARTIAL
}

/// <summary>How complete the evidence of one robot's run (one assignment) is. Not the robot's job status.</summary>
public enum EvidenceRunStatus
{
    PENDING,
    RECORDING,
    FINALIZING,
    FINALIZED,
    PARTIAL,
    CAPTURE_FAILED
}

public enum RecordingStatus
{
    PENDING,
    RECORDING,
    FINALIZING,
    UPLOADING,
    READY,
    PARTIAL,
    FAILED
}

public enum ContinuityGroupStatus
{
    OPEN,
    SEALED,
    VERIFYING,
    READY_FOR_PROCESSING,
    PARTIAL,
    INVALID
}

public enum SegmentUploadStatus
{
    REGISTERED,
    UPLOAD_PENDING,
    UPLOADING,
    UPLOADED,
    VERIFIED,
    FAILED,
    QUARANTINED
}

public enum MediaAssetStatus
{
    PENDING,
    QUEUED,
    PROCESSING,
    READY,
    FAILED,
    PARTIAL
}

/// <summary>Internal state of a transcode job; the provider's own enum stays in its adapter.</summary>
public enum MediaProcessingStatus
{
    QUEUED,
    CLAIMED,
    SUBMITTING,
    SUBMITTED,
    PROGRESSING,
    COMPLETE,
    ERROR,
    CANCELED,
    RETRY_PENDING
}

public enum EvidenceSeverity
{
    INFO,
    WARNING,
    ERROR,
    CRITICAL
}

public enum EvidenceEventCategory
{
    NAVIGATION,
    TRAFFIC,
    HARDWARE,
    CAMERA,
    RECORDING,
    MEDIA,
    CARGO,
    FLEET,
    SYSTEM
}

/// <summary>Why a continuity group ended and a new one started.</summary>
public enum ContinuityGapReason
{
    REBOOT,
    CAMERA_LOST,
    FRAME_GAP,
    CLOCK_UNCERTAIN,
    INPUT_LIMIT
}

public enum AnnotationCategory
{
    NOTE,
    OBSERVATION,
    ROOT_CAUSE,
    ACTION
}

public enum AccessAction
{
    VIEW,
    PLAY,
    DOWNLOAD,
    EXPORT,
    ANNOTATE,
    GRANT
}

public enum AccessResult
{
    ALLOWED,
    DENIED
}
