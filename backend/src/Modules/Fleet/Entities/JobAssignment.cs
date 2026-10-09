using WaroTrans.BuildingBlocks.Exceptions;
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

    public static JobAssignment CreatePending(Guid jobId, Guid robotId, DateTimeOffset utcNow, Guid? id = null)
    {
        return new JobAssignment
        {
            Id = id ?? Guid.NewGuid(),
            JobId = jobId,
            RobotId = robotId,
            Status = JobAssignmentStatus.PENDING_ACK,
            AssignedAt = utcNow
        };
    }

    public bool TryAcknowledge(DateTimeOffset utcNow)
    {
        if (Status == JobAssignmentStatus.ENDED)
        {
            return false;
        }

        if (Status is JobAssignmentStatus.ACKNOWLEDGED or JobAssignmentStatus.ACTIVE)
        {
            return false;
        }

        if (Status != JobAssignmentStatus.PENDING_ACK)
        {
            return false;
        }

        Status = JobAssignmentStatus.ACKNOWLEDGED;
        AcknowledgedAt = utcNow;
        return true;
    }

    public bool TryActivate(DateTimeOffset utcNow)
    {
        if (Status == JobAssignmentStatus.ENDED)
        {
            return false;
        }

        if (Status == JobAssignmentStatus.ACTIVE)
        {
            return false;
        }

        if (Status is not (JobAssignmentStatus.PENDING_ACK or JobAssignmentStatus.ACKNOWLEDGED))
        {
            return false;
        }

        if (Status == JobAssignmentStatus.PENDING_ACK)
        {
            AcknowledgedAt ??= utcNow;
        }

        Status = JobAssignmentStatus.ACTIVE;
        ActivatedAt = utcNow;
        return true;
    }

    public bool TryEnd(AssignmentEndReason reason, DateTimeOffset utcNow)
    {
        if (Status == JobAssignmentStatus.ENDED)
        {
            return false;
        }

        Status = JobAssignmentStatus.ENDED;
        EndedAt = utcNow;
        EndReason = reason;
        return true;
    }

    public void EnsureNotEnded()
    {
        if (Status == JobAssignmentStatus.ENDED)
        {
            throw new DomainValidationException(
                "Job assignment already ended.",
                "job_assignment_ended");
        }
    }
}
