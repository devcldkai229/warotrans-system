namespace WaroTrans.WorkflowExecution.Features.ResumeJob;

/// <param name="RobotId">Optional robot. Empty = the robot the Job was assigned to.</param>
public sealed record ResumeJobRequest(Guid? RobotId);
