namespace WaroTrans.WorkflowExecution.Entities;

/// <summary>
/// WFX-04 / FL-06: a robot failed with cargo on board. The Job stays the same Job (rules/12): the case records whose
/// cargo it is, which robot comes for it, where, and who confirmed the physical transfer.
/// </summary>
public sealed class JobRecoveryCase
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public Guid? FromRobotId { get; set; }
    public Guid? ToRobotId { get; set; }
    public Guid? RecoveryEndpointId { get; set; }
    public Guid? MoveStepId { get; set; }

    /// <summary>OPEN, TARGET_ASSIGNED, TRANSFERRED, RESUMED_SAME_ROBOT or CANCELLED.</summary>
    public string Status { get; set; } = JobRecoveryStatuses.Open;
    public string Reason { get; set; } = string.Empty;
    public List<Guid> ContainerIds { get; set; } = [];
    public Guid? ClaimedBy { get; set; }
    public int Version { get; set; }
    public Guid? ButtonArmId { get; set; }
    public Guid? ConfirmedBy { get; set; }
    public Guid? ConfirmedByRobotId { get; set; }
    public Guid? ButtonConfirmationMessageId { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    // ------------------------------------------------------------------ payload recovery design (2026-11-26)

    /// <summary>
    /// Where the open case stands (<see cref="RecoveryPhases"/>): assessment, the failed robot moving or secured, the
    /// second robot on its way or there. Null on cases opened before phases existed (treated as secured).
    /// </summary>
    public string? Phase { get; set; }

    /// <summary><see cref="RecoveryModes"/>: how the failed robot is dealt with, set by the technical assessment.</summary>
    public string? RecoveryMode { get; set; }

    /// <summary>The failed robot when the case opened: last pose, when it was seen, its map and error. A hint, not proof.</summary>
    public double? LastPoseX { get; set; }
    public double? LastPoseY { get; set; }
    public double? LastPoseYaw { get; set; }
    public DateTimeOffset? LastPoseAt { get; set; }
    public Guid? FaultMapVersionId { get; set; }
    public string? FaultErrorCode { get; set; }
    public bool? FaultRobotOnline { get; set; }

    /// <summary>A technician confirmed where the failed robot really stands (the last pose is only a hint).</summary>
    public bool LocationVerified { get; set; }
    public double? VerifiedX { get; set; }
    public double? VerifiedY { get; set; }
    public Guid? LocationVerifiedBy { get; set; }
    public DateTimeOffset? LocationVerifiedAt { get; set; }

    /// <summary><see cref="RecoveryAssessmentResults"/>, with who and when, the checklist (JSON) and a note.</summary>
    public string? AssessmentResult { get; set; }
    public Guid? AssessedBy { get; set; }
    public DateTimeOffset? AssessedAt { get; set; }
    public string? AssessmentChecklistJson { get; set; }
    public string? AssessmentNote { get; set; }

    /// <summary>Where the failed robot drives to by itself (a wait point) and the step that takes it there.</summary>
    public Guid? SourceEndpointId { get; set; }
    public Guid? SourceMoveStepId { get; set; }

    /// <summary>A technician confirmed the failed robot stands still in a safe place: the second robot may come.</summary>
    public Guid? SourceSecuredBy { get; set; }
    public DateTimeOffset? SourceSecuredAt { get; set; }

    /// <summary>Null while the case is open. A Job has at most one open case.</summary>
    public DateTimeOffset? ResolvedAt { get; set; }

    public Job Job { get; set; } = null!;
}

public static class JobRecoveryStatuses
{
    public const string Open = "OPEN";
    public const string TargetAssigned = "TARGET_ASSIGNED";
    public const string Transferred = "TRANSFERRED";
    public const string ResumedSameRobot = "RESUMED_SAME_ROBOT";
    public const string Cancelled = "CANCELLED";

    /// <summary>The cargo was dealt with by hand (returned, quarantined, kept at a recovery point), not by a second robot.</summary>
    public const string ResolvedManually = "RESOLVED_MANUALLY";
}

/// <summary>Where an open recovery case stands, beside its <see cref="JobRecoveryCase.Status"/>.</summary>
public static class RecoveryPhases
{
    public const string AssessmentRequired = "ASSESSMENT_REQUIRED";
    public const string Assessed = "ASSESSED";
    public const string SourceRepositioning = "SOURCE_REPOSITIONING";
    public const string SourceSecured = "SOURCE_SECURED";
    public const string TargetEnRoute = "TARGET_EN_ROUTE";
    public const string AwaitingTransfer = "AWAITING_TRANSFER";
    public const string InterventionRequired = "INTERVENTION_REQUIRED";
}

public static class RecoveryModes
{
    public const string SelfEvacuation = "SELF_EVACUATION";
    public const string Manual = "MANUAL";
    public const string SameRobot = "SAME_ROBOT";
}

public static class RecoveryAssessmentResults
{
    /// <summary>The failed robot may drive itself to a recovery point (every safety check passed).</summary>
    public const string SelfEvacuationApproved = "SELF_EVACUATION_APPROVED";

    /// <summary>It must not move by itself: people bring it (or its cargo) to safety.</summary>
    public const string ManualRecoveryRequired = "MANUAL_RECOVERY_REQUIRED";

    /// <summary>Fixed where it stands: the same robot goes on with the Job.</summary>
    public const string SameRobotRecoverable = "SAME_ROBOT_RECOVERABLE";

    public static readonly string[] All = [SelfEvacuationApproved, ManualRecoveryRequired, SameRobotRecoverable];
}
