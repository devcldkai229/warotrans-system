using System.Text.Json;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

public sealed class HandoverConfirmation
{
    public Guid Id { get; set; }
    public Guid JobStepId { get; set; }
    public Guid ContainerId { get; set; }

    /// <summary>Staff account when ConfirmationSource is STAFF_APP; null for ROBOT_BUTTON.</summary>
    public Guid? ConfirmedBy { get; set; }

    public ConfirmationSource ConfirmationSource { get; set; } = ConfirmationSource.STAFF_APP;

    /// <summary>Assigned robot when ConfirmationSource is ROBOT_BUTTON.</summary>
    public Guid? ConfirmedByRobotId { get; set; }

    /// <summary>MQTT messageId of interaction_confirm when ConfirmationSource is ROBOT_BUTTON.</summary>
    public Guid? SourceMessageId { get; set; }

    public HandoverType HandoverType { get; set; }
    public DateTimeOffset ConfirmedAt { get; set; }
    public string? Note { get; set; }
    public Dictionary<string, JsonElement>? Evidence { get; set; }

    public JobStep JobStep { get; set; } = null!;
}
