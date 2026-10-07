using WaroTrans.BuildingBlocks.Abstractions;

namespace WaroTrans.BuildingBlocks.IntegrationEvents;

/// <summary>
/// Fleet publishes; WorkflowExecution may update JobStep status only (no Job CRUD).
/// </summary>
public sealed record RobotCommandLifecycleChanged(
    Guid CommandId,
    Guid RobotId,
    string RobotCode,
    string Type,
    string Status,
    Guid? JobAssignmentId,
    Guid? JobStepId,
    string? Outcome,
    string? ErrorCode,
    string Phase) : IIntegrationEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;

    public static class Phases
    {
        public const string Issued = "ISSUED";
        public const string AckAccepted = "ACK_ACCEPTED";
        public const string AckRejected = "ACK_REJECTED";
        public const string Result = "RESULT";
        public const string AckTimeout = "ACK_TIMEOUT";
        public const string OfflineAbort = "OFFLINE_ABORT";
    }
}
