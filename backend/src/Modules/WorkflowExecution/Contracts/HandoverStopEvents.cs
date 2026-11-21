using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.WorkflowExecution.Contracts;

public sealed record HandoverStopQueueChanged(Guid JobId, Guid StopId, Guid WarehouseId) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}

public sealed record HandoverStopNotice(
    Guid JobId, string JobNo, Guid StopId, Guid MoveId, int Version,
    Guid WarehouseId, Guid? RobotId, string Kind, Guid? ReceiverId = null) : IIntegrationEvent
{
    public const string Offer = "HANDOVER_STOP_OFFERED";
    public const string BeginReminder = "HANDOVER_START_REMINDER";
    public const string Unstarted = "HANDOVER_NOT_STARTED";
    public const string Overdue = "HANDOVER_OVERDUE";

    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
}
