using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class HandoverConfirmation
{
    public Guid Id { get; set; }
    public Guid JobStepId { get; set; }
    public Guid ContainerId { get; set; }
    public Guid ConfirmedBy { get; set; }
    public HandoverType HandoverType { get; set; }
    public DateTimeOffset ConfirmedAt { get; set; }
    public string? Note { get; set; }
    public Dictionary<string, JsonElement>? Evidence { get; set; }

    public JobStep JobStep { get; set; } = null!;
}
