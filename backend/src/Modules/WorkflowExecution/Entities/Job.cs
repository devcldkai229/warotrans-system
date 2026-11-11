using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class Job
{
    public Guid Id { get; set; }
    public string JobNo { get; set; } = string.Empty;
    public Guid WorkflowId { get; set; }
    public Guid MapVersionId { get; set; }
    /// <summary>
    /// Idempotency key: {transportRequestId:N}:{batchKey}. Unique across jobs.
    /// </summary>
    public string ProvisioningKey { get; set; } = string.Empty;
    public JobStatus Status { get; set; }
    public Dictionary<string, JsonElement> ContextValues { get; set; } = new();
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? QueuedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }

    /// <summary>FL-07: copied from the request.</summary>
    public int Priority { get; set; }
    public DateTimeOffset? DeadlineAt { get; set; }

    /// <summary>FL-07: why a queued Job has not been dispatched, as last tried. Null when nothing is holding it.</summary>
    public string? BlockingReason { get; set; }

    public ICollection<JobTask> JobTasks { get; set; } = [];
    public ICollection<JobContainer> JobContainers { get; set; } = [];

    public void MarkRecoveryRequired(string? failureCode = null, string? failureMessage = null)
    {
        if (Status is not (JobStatus.RUNNING or JobStatus.ASSIGNED or JobStatus.PAUSED))
        {
            throw new InvalidOperationException(
                $"Job can only enter RECOVERY_REQUIRED from RUNNING/ASSIGNED/PAUSED (current: {Status}).");
        }

        Status = JobStatus.RECOVERY_REQUIRED;
        FailureCode = failureCode;
        FailureMessage = failureMessage;
    }
}
