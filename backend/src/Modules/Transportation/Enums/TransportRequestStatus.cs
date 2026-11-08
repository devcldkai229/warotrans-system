namespace WaroTrans.Transportation.Enums;

public enum TransportRequestStatus
{
    SUBMITTED,
    QUEUED,
    IN_PROGRESS,
    PARTIALLY_COMPLETED,
    COMPLETED,
    FAILED,
    CANCELLED,
    REJECTED,

    /// <summary>
    /// Cancel accepted, but containers of the request are on a robot (WH-04): the request becomes terminal once that
    /// cargo has been unloaded (Job cancelled) or delivered (Job resumed).
    /// </summary>
    CANCELLING
}
