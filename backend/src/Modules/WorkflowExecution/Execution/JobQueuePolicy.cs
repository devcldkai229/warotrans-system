namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>FL-07. Section "JobQueue". All in minutes of waiting, so the trade-offs can be read directly.</summary>
public sealed class JobQueueOptions
{
    public const string SectionName = "JobQueue";

    /// <summary>A high priority Job goes ahead of a normal one that has waited up to this long, and a low one behind.</summary>
    public double PriorityMinutes { get; set; } = 15;

    /// <summary>A Job this close to its deadline, or past it, moves up by <see cref="DeadlineBoostMinutes"/>.</summary>
    public double DeadlineWindowMinutes { get; set; } = 30;
    public double DeadlineBoostMinutes { get; set; } = 30;
}

/// <summary>
/// FL-07: higher goes first. Waiting always counts, one point a minute, and priority and deadline only add a fixed
/// amount, so no Job can be held back for ever: a low priority one overtakes any newcomer eventually. Ties: first come.
/// </summary>
public static class JobQueuePolicy
{
    public static double Score(int priority, DateTimeOffset? deadlineAt, DateTimeOffset queuedAt, DateTimeOffset now, JobQueueOptions options)
    {
        var waited = Math.Max(0, (now - queuedAt).TotalMinutes);
        var urgent = deadlineAt is { } deadline && (deadline - now).TotalMinutes <= options.DeadlineWindowMinutes;
        return waited + priority * options.PriorityMinutes + (urgent ? options.DeadlineBoostMinutes : 0);
    }
}
