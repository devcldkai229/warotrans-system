using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Execution;

/// <summary>
/// BOTH-04: the one place that says which operator actions a Job allows in its current state. The engine's guards
/// and the <c>availableActions</c> of the Job DTO both read it, so the button a client shows and the answer the
/// endpoint gives cannot drift apart.
/// </summary>
public static class JobActionPolicy
{
    public const string Start = "START";
    public const string Pause = "PAUSE";
    public const string Resume = "RESUME";
    public const string Cancel = "CANCEL";

    public static readonly IReadOnlyList<string> All = [Start, Pause, Resume, Cancel];

    /// <summary>Null when the state allows the action, otherwise the error code the endpoint answers with.</summary>
    public static string? StateReason(string action, JobStatus status) => action switch
    {
        Start => status is JobStatus.CREATED or JobStatus.QUEUED ? null : "job_not_startable",
        Pause => status == JobStatus.RUNNING ? null : "job_not_running",
        Resume => status is JobStatus.PAUSED or JobStatus.REASSIGNING ? null : "job_not_resumable",
        Cancel => status is JobStatus.COMPLETED or JobStatus.CANCELLED or JobStatus.FAILED ? "job_already_terminal" : null,
        _ => "unknown_action"
    };

    public static string PermissionOf(string action) => action switch
    {
        Pause => Permissions.JobPause,
        Cancel => Permissions.JobCancel,
        _ => Permissions.JobOperate
    };

    public static IReadOnlyList<ActionAvailability> Evaluate(JobStatus status, Func<string, bool> can) =>
        All.Select(action => ActionAvailability.Of(action, StateReason(action, status), can(PermissionOf(action)))).ToList();
}
