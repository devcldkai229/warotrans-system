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
    public Guid? ConfirmedBy { get; set; }
    public DateTimeOffset? ConfirmedAt { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

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
}
