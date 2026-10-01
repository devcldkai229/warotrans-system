using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class Job
{
    public Guid Id { get; set; }
    public string JobNo { get; set; } = string.Empty;
    public Guid TransportRequestId { get; set; }
    public Guid WorkflowId { get; set; }
    public Guid MapVersionId { get; set; }
    public JobStatus Status { get; set; }
    public Dictionary<string, JsonElement> ContextValues { get; set; } = new();
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? QueuedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }

    public ICollection<JobTask> JobTasks { get; set; } = [];

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
