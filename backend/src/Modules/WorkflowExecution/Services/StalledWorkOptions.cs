namespace WaroTrans.WorkflowExecution.Services;

/// <summary>How long work may wait before the system tells an admin (configuration section <c>StalledWork</c>).</summary>
public sealed class StalledWorkOptions
{
    public const string SectionName = "StalledWork";

    /// <summary>Minutes a job may sit un-started (CREATED / QUEUED) before it is reported.</summary>
    public int UnstartedJobMinutes { get; set; } = 10;

    /// <summary>Minutes a HUMAN_INTERACTION step may wait for a person before it is reported.</summary>
    public int HumanStepMinutes { get; set; } = 15;

    /// <summary>Seconds between two checks.</summary>
    public int CheckIntervalSeconds { get; set; } = 60;
}
