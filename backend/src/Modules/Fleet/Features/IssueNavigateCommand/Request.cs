namespace WaroTrans.Fleet.Features.IssueNavigateCommand;

public sealed record IssueNavigateCommandRequest(
    double X,
    double Y,
    double Yaw,
    string? FrameId,
    Guid? JobId,
    Guid? JobAssignmentId,
    Guid? JobStepId);
