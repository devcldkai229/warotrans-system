using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class JobTask
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public Guid WorkflowTaskId { get; set; }
    public int SequenceNo { get; set; }
    public Dictionary<string, JsonElement> ContextValues { get; set; } = new();
    public JobTaskStatus Status { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? FailureCode { get; set; }

    public Job Job { get; set; } = null!;
    public ICollection<JobStep> JobSteps { get; set; } = [];
}
