namespace WaroTrans.Transportation.Enums;

public enum TransportRequestDetailStatus
{
    PENDING,
    QUEUED,
    IN_PROGRESS,
    COMPLETED,
    FAILED,
    CANCELLED,

    /// <summary>The request was cancelled while this container was on a robot (or in a Job with cargo on board).</summary>
    CANCEL_PENDING_RECOVERY
}
