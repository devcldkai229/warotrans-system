using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class JobStep
{
    public Guid Id { get; set; }
    public Guid JobTaskId { get; set; }
    public Guid WorkflowStepId { get; set; }
    public int SequenceNo { get; set; }
    public StepType StepType { get; set; }
    public JobStepStatus Status { get; set; }
    public Dictionary<string, JsonElement> ResolvedInputs { get; set; } = new();
    public Dictionary<string, JsonElement> OutputValues { get; set; } = new();
    public Guid? TargetEndpointId { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }

    public JobTask JobTask { get; set; } = null!;
    public HandoverConfirmation? HandoverConfirmation { get; set; }
}
