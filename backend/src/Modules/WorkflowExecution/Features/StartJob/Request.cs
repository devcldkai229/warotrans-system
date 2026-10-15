namespace WaroTrans.WorkflowExecution.Features.StartJob;

/// <param name="RobotId">Optional robot. Empty = best AVAILABLE robot on the Job's map that runs no other Job.</param>
public sealed record StartJobRequest(Guid? RobotId);
