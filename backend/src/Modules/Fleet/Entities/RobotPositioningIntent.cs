using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

/// <summary>
/// FL-08: Fleet moves an idle robot to a parking Endpoint on its own initiative. Not a Job and not a Transport Request:
/// it carries no Container, holds no Job assignment, and gives way to any Job (that Job's first MOVE waits until the
/// NAVIGATE here has ended and traffic has been reconciled).
/// </summary>
public sealed class RobotPositioningIntent
{
    public Guid Id { get; set; }
    public Guid RobotId { get; set; }
    public Guid MapVersionId { get; set; }
    public PositioningIntentKind Kind { get; set; }
    public Guid TargetEndpointId { get; set; }
    public PositioningIntentStatus Status { get; set; }

    /// <summary>The NAVIGATE_TO_POSE (no Job, no Job step). Null only between the claim and the send.</summary>
    public Guid? NavigateCommandId { get; set; }

    public Guid? YieldToJobId { get; set; }
    public DateTimeOffset? CancelRequestedAt { get; set; }
    public string? EndReason { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }

    public bool IsLive => Status is PositioningIntentStatus.NAVIGATING or PositioningIntentStatus.YIELDING;

    public void End(PositioningIntentStatus status, string reason, DateTimeOffset now)
    {
        Status = status;
        EndReason = reason.Length > 200 ? reason[..200] : reason;
        EndedAt = now;
        UpdatedAt = now;
    }
}
