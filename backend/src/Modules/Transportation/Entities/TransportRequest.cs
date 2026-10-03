using System.Text.Json;
using WaroTrans.Transportation.Enums;

namespace WaroTrans.Transportation.Entities;

/// <summary>
/// Runtime: one TransportRequest maps to N Jobs via JobContainer; movement plan is TransportRequestDetail.
/// </summary>
public sealed class TransportRequest
{
    public Guid Id { get; set; }
    public string RequestCode { get; set; } = string.Empty;
    public Guid WarehouseId { get; set; }
    public Guid WorkflowId { get; set; }
    public Guid RequestedBy { get; set; }
    public TransportRequestStatus Status { get; set; }
    public int PlanSchemaVersion { get; set; }
    public Dictionary<string, JsonElement>? WorkflowInputs { get; set; }
    public string? Note { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset? QueuedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string? FailureCode { get; set; }
    public string? FailureMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; }

    public ICollection<TransportRequestDetail> Details { get; set; } = [];
}
