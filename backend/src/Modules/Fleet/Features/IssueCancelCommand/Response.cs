using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.IssueCancelCommand;

public sealed record IssueCancelCommandResponse(
    Guid CommandId,
    Guid TargetCommandId,
    Guid RobotId,
    string RobotCode,
    RobotCommandStatus Status);
