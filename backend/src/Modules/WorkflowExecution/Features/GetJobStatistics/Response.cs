namespace WaroTrans.WorkflowExecution.Features.GetJobStatistics;

/// <summary>
/// Job numbers for the admin dashboard. Completed / failed / durations / per-workflow / daily / failure codes are about
/// jobs that finished inside the window; <c>Active</c> is how many jobs are in each non-terminal status right now.
/// <c>AvgQueueWaitSeconds</c> is how long jobs that started in the window had waited, from creation to start.
/// </summary>
public sealed record JobStatisticsResponse(
    DateTimeOffset From,
    DateTimeOffset To,
    int Created,
    int Completed,
    int Failed,
    int PreviousCompleted,
    double? AvgDurationSeconds,
    double? AvgQueueWaitSeconds,
    IReadOnlyList<JobStatusCount> Active,
    IReadOnlyList<WorkflowJobStatistics> ByWorkflow,
    IReadOnlyList<DailyJobStatistics> Daily,
    IReadOnlyList<FailureCodeCount> TopFailureCodes);

public sealed record JobStatusCount(string Status, int Count);

public sealed record WorkflowJobStatistics(
    Guid WorkflowId,
    string WorkflowCode,
    string WorkflowName,
    int Completed,
    int Failed,
    double? AvgDurationSeconds);

public sealed record DailyJobStatistics(DateOnly Date, int Completed, int Failed);

public sealed record FailureCodeCount(string Code, int Count);
