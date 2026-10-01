using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

public sealed class JobAssignment
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public Guid RobotId { get; set; }
    public JobAssignmentStatus Status { get; set; }
    public DateTimeOffset AssignedAt { get; set; }
    public DateTimeOffset? AcknowledgedAt { get; set; }
    public DateTimeOffset? ActivatedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public AssignmentEndReason? EndReason { get; set; }
}
