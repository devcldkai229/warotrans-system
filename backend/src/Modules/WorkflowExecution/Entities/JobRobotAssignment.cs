namespace WaroTrans.WorkflowExecution.Entities;

/// <summary>
/// FL-04: which robot holds a Job, and since when. A Job has one robot at a time and a robot one Job at a time: the
/// database enforces both, on the rows with no EndedAt. A Job handed to another robot keeps the earlier row as history.
/// N trips of a request are N Jobs, each with its own row.
/// </summary>
public sealed class JobRobotAssignment
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public Guid RobotId { get; set; }

    /// <summary>START, REASSIGN or BACKFILL.</summary>
    public string StartReason { get; set; } = JobRobotAssignmentReasons.Start;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }

    /// <summary>The Job status that ended it, or REASSIGNED.</summary>
    public string? EndReason { get; set; }

    public Job Job { get; set; } = null!;
}

public static class JobRobotAssignmentReasons
{
    public const string Start = "START";
    public const string Reassign = "REASSIGN";
    public const string Reassigned = "REASSIGNED";
}
