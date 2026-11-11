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

    /// <summary>WH-03: who is handling this human step. Only counts while <see cref="ClaimExpiresAt"/> is in the future.</summary>
    public Guid? ClaimedBy { get; set; }
    public DateTimeOffset? ClaimedAt { get; set; }
    public DateTimeOffset? ClaimExpiresAt { get; set; }

    /// <summary>Bumped on every claim change. The database refuses a write made from an older value, so only one person wins.</summary>
    public int ClaimVersion { get; set; }

    /// <summary>SY-02: when a waiting human step is overdue. Stored, so it survives a restart.</summary>
    public DateTimeOffset? DeadlineAt { get; set; }
    public DateTimeOffset? EscalatedAt { get; set; }

    public JobTask JobTask { get; set; } = null!;
    public HandoverConfirmation? HandoverConfirmation { get; set; }
}
