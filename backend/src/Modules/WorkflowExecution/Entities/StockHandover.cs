using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Entities;

/// <summary>A confirmed handover awaiting delivery to Transportation's stock posting queue.</summary>
internal sealed class StockHandover
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public Guid TransportRequestId { get; set; }
    public Guid ContainerId { get; set; }
    public Guid? ConfirmedBy { get; set; }
    public HandoverType Type { get; set; }
    public DateTimeOffset ConfirmedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public int Attempts { get; set; }
}
