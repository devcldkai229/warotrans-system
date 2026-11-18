using System.Net;
using WaroTrans.Evidence.Enums;

namespace WaroTrans.Evidence.Entities;

// External IDs (TransportRequest, Job, assignment, map, account) are references only: no foreign key crosses into the
// monolith's database. Their types are those of the source (all Guid there, audited 2026-11-17).

/// <summary>The evidence file of one Transport Request (spec §4.1). The request itself stays in Transportation.</summary>
public sealed class EvidenceJournal
{
    public Guid Id { get; set; }
    public Guid TransportRequestId { get; set; }

    /// <summary>The request code as Transportation shows it (RddMMyyNNN, older ones REQ-yyyyMMdd-NNNNNN).</summary>
    public string RequestCode { get; set; } = string.Empty;

    public EvidenceJournalStatus Status { get; set; } = EvidenceJournalStatus.OPEN;
    public int RequestedContainerCount { get; set; }

    /// <summary>TransportRequestStatus exactly as Transportation stores it (never mapped onto Evidence statuses).</summary>
    public string? TransportStatusSnapshot { get; set; }

    /// <summary>When the snapshot was true at the source: an older event never overwrites a newer one.</summary>
    public DateTimeOffset? TransportStatusAtUtc { get; set; }

    public DateTimeOffset? FirstStartedAtUtc { get; set; }
    public DateTimeOffset? LastEndedAtUtc { get; set; }

    /// <summary>Incident hold: retention never deletes this journal's data before this time.</summary>
    public DateTimeOffset? RetentionHoldUntilUtc { get; set; }

    public DateTimeOffset? LastReconciledAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }

    /// <summary>Optimistic concurrency token, incremented by the application on every change.</summary>
    public long RowVersion { get; set; }

    public ICollection<RobotRunEvidence> Runs { get; set; } = [];
}

/// <summary>
/// One robot running one trip once: one row of the source's execution.job_robot_assignments (spec §4.2). A trip handed
/// to another robot, or the same robot again, is a new run; the old one is kept.
/// </summary>
public sealed class RobotRunEvidence
{
    public const string AssignmentKeyPrefix = "jra:";

    public Guid Id { get; set; }
    public Guid JournalId { get; set; }

    /// <summary><c>jra:{assignmentId}</c>: stable across retries, unique per attempt.</summary>
    public string RunCorrelationKey { get; set; } = string.Empty;

    public Guid? SourceJobId { get; set; }
    public string? SourceJobNo { get; set; }
    public Guid? SourceJobTaskId { get; set; }
    public Guid? SourceAssignmentId { get; set; }

    /// <summary>Robot code (RBT-001).</summary>
    public string RobotId { get; set; } = string.Empty;

    /// <summary>The robot's Guid in Fleet.</summary>
    public Guid? RobotSourceId { get; set; }

    /// <summary>Containers of the trip at assignment time (snapshot, never used for inventory).</summary>
    public List<Guid> AssignedContainerIds { get; set; } = [];

    public EvidenceRunStatus Status { get; set; } = EvidenceRunStatus.PENDING;

    /// <summary>Source Job status / assignment end reason, verbatim.</summary>
    public string? TransportRunStatusSnapshot { get; set; }

    /// <summary>START, REASSIGN or BACKFILL, verbatim.</summary>
    public string? StartReason { get; set; }

    public Guid? MapId { get; set; }
    public string? MapVersion { get; set; }
    public string? FrameId { get; set; }
    public DateTimeOffset? StartedAtUtc { get; set; }
    public DateTimeOffset? EndedAtUtc { get; set; }
    public double? ClockOffsetEstimateMs { get; set; }
    public double? TimeSyncErrorBoundMs { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }

    public EvidenceJournal Journal { get; set; } = null!;
    public ICollection<CameraRecording> Recordings { get; set; } = [];

    public static string KeyFor(Guid assignmentId) => AssignmentKeyPrefix + assignmentId.ToString("D");
}

/// <summary>Something that happened, for the investigation timeline (spec §4.8).</summary>
public sealed class EvidenceEvent
{
    public const int MaxPayloadChars = 16_384;

    public Guid Id { get; set; }
    public Guid JournalId { get; set; }
    public Guid? RobotRunEvidenceId { get; set; }

    /// <summary>warotrans-core, robot, camera, media …</summary>
    public string SourceSystem { get; set; } = string.Empty;

    /// <summary>Idempotency id given by the source.</summary>
    public string SourceEventId { get; set; } = string.Empty;

    public EvidenceEventCategory Category { get; set; }

    /// <summary>The source's own event name.</summary>
    public string EventType { get; set; } = string.Empty;

    public EvidenceSeverity Severity { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; }
    public double? X { get; set; }
    public double? Y { get; set; }
    public string? FrameId { get; set; }
    public string? Message { get; set; }

    /// <summary>The source payload (jsonb, at most <see cref="MaxPayloadChars"/>).</summary>
    public string Payload { get; set; } = "{}";

    public string? CorrelationId { get; set; }
    public short PayloadSchemaVersion { get; set; }
}

/// <summary>A technician's note, bookmark or root cause at a moment of the replay (spec §4.12).</summary>
public sealed class EvidenceAnnotation
{
    public Guid Id { get; set; }
    public Guid JournalId { get; set; }
    public Guid? RobotRunEvidenceId { get; set; }
    public Guid AuthorUserId { get; set; }
    public string? AuthorName { get; set; }
    public DateTimeOffset AtUtc { get; set; }
    public AnnotationCategory Category { get; set; }
    public string Note { get; set; } = string.Empty;
    public string? SnapshotS3Key { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset? UpdatedAtUtc { get; set; }
    public DateTimeOffset? DeletedAtUtc { get; set; }
}

/// <summary>Who looked at, played, exported or was refused what (spec §4.13).</summary>
public sealed class EvidenceAccessAudit
{
    public Guid Id { get; set; }

    /// <summary>Null for actions not about one journal (robot credentials).</summary>
    public Guid? JournalId { get; set; }

    public Guid? ActorUserId { get; set; }
    public string? ActorName { get; set; }
    public AccessAction Action { get; set; }
    public Guid? ResourceId { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; }
    public IPAddress? IpAddress { get; set; }
    public AccessResult Result { get; set; }
    public string? RequestId { get; set; }
    public string? Detail { get; set; }
}
