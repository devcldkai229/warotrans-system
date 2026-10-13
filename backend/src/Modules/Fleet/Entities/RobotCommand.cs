using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

public sealed class RobotCommand
{
    public Guid Id { get; set; }
    public Guid RobotId { get; set; }
    public Guid? JobAssignmentId { get; set; }
    public Guid? JobStepId { get; set; }
    public RobotCommandType Type { get; set; }
    public RobotCommandStatus Status { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public Guid? TargetCommandId { get; set; }
    public DateTimeOffset IssuedAt { get; set; }
    public DateTimeOffset? AckedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? Outcome { get; set; }
    public string? ErrorCode { get; set; }
    public string? RejectReasonCode { get; set; }

    public static RobotCommand CreateNavigate(
        Guid robotId,
        Guid commandId,
        string payloadJson,
        DateTimeOffset utcNow,
        Guid? jobAssignmentId,
        Guid? jobStepId)
    {
        return new RobotCommand
        {
            Id = commandId,
            RobotId = robotId,
            JobAssignmentId = jobAssignmentId,
            JobStepId = jobStepId,
            Type = RobotCommandType.NAVIGATE_TO_POSE,
            Status = RobotCommandStatus.SENT,
            PayloadJson = payloadJson,
            IssuedAt = utcNow
        };
    }

    public static RobotCommand CreateCancel(
        Guid robotId,
        Guid commandId,
        Guid targetCommandId,
        string payloadJson,
        DateTimeOffset utcNow,
        Guid? jobAssignmentId,
        Guid? jobStepId)
    {
        return new RobotCommand
        {
            Id = commandId,
            RobotId = robotId,
            JobAssignmentId = jobAssignmentId,
            JobStepId = jobStepId,
            Type = RobotCommandType.CANCEL,
            Status = RobotCommandStatus.SENT,
            TargetCommandId = targetCommandId,
            PayloadJson = payloadJson,
            IssuedAt = utcNow
        };
    }

    public bool IsTerminal => Status is RobotCommandStatus.REJECTED
        or RobotCommandStatus.COMPLETED
        or RobotCommandStatus.FAILED
        or RobotCommandStatus.CANCELED
        or RobotCommandStatus.TIMEOUT
        or RobotCommandStatus.ABORTED;

    public bool IsInFlight => Status is RobotCommandStatus.SENT
        or RobotCommandStatus.ACKED
        or RobotCommandStatus.RUNNING;

    public bool TryApplyAck(bool accepted, string? reasonCode, DateTimeOffset utcNow)
    {
        if (IsTerminal)
        {
            return false;
        }

        if (Status is RobotCommandStatus.ACKED or RobotCommandStatus.RUNNING)
        {
            // Idempotent: already accepted.
            return false;
        }

        if (Status != RobotCommandStatus.SENT)
        {
            return false;
        }

        AckedAt = utcNow;
        RejectReasonCode = reasonCode;

        if (accepted)
        {
            Status = Type == RobotCommandType.CANCEL
                ? RobotCommandStatus.ACKED
                : RobotCommandStatus.RUNNING;
        }
        else
        {
            Status = RobotCommandStatus.REJECTED;
            CompletedAt = utcNow;
        }

        return true;
    }

    public bool TryApplyResult(string outcome, string? errorCode, DateTimeOffset utcNow)
    {
        if (IsTerminal)
        {
            return false;
        }

        Outcome = outcome;
        ErrorCode = errorCode;
        CompletedAt = utcNow;

        Status = outcome switch
        {
            RobotCommandOutcomes.Succeeded => RobotCommandStatus.COMPLETED,
            RobotCommandOutcomes.Failed => RobotCommandStatus.FAILED,
            RobotCommandOutcomes.Canceled => RobotCommandStatus.CANCELED,
            _ => throw new DomainValidationException(
                $"Unknown command outcome '{outcome}'.",
                "invalid_command_outcome")
        };

        return true;
    }

    public bool TryMarkAckTimeout(DateTimeOffset utcNow)
    {
        if (Status != RobotCommandStatus.SENT)
        {
            return false;
        }

        Status = RobotCommandStatus.TIMEOUT;
        CompletedAt = utcNow;
        ErrorCode = "ACK_TIMEOUT";
        return true;
    }

    public bool TryAbortOffline(DateTimeOffset utcNow)
    {
        if (!IsInFlight)
        {
            return false;
        }

        Status = RobotCommandStatus.ABORTED;
        CompletedAt = utcNow;
        ErrorCode = "ROBOT_OFFLINE";
        return true;
    }
}
