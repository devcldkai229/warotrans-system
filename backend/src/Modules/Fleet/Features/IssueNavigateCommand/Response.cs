using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.IssueNavigateCommand;

public sealed record IssueNavigateCommandResponse(
    Guid CommandId,
    Guid RobotId,
    string RobotCode,
    RobotCommandStatus Status,
    Guid? JobAssignmentId,
    Guid? JobStepId);
