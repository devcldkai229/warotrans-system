using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

/// <summary>
/// Allocation of a Container to a Job for a TransportRequest.
/// Cross-module IDs (TransportRequestId, ContainerId) are UUID scalars only.
/// </summary>
public sealed class JobContainer
{
    public Guid Id { get; set; }
    public Guid TransportRequestId { get; set; }
    public Guid JobId { get; set; }
    public Guid ContainerId { get; set; }
    public int SequenceNo { get; set; }
    public JobContainerStatus Status { get; set; }
    public DateTimeOffset? LoadedAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public Job Job { get; set; } = null!;
}
