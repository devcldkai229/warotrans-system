namespace WaroTrans.WorkflowExecution.Enums;

public enum HandoverType
{
    PICKUP,
    DROPOFF,
    PAYLOAD_TRANSFER,
    MAINTENANCE,
    INSPECTION,
    CHARGE_CONNECT,
    CHARGE_DISCONNECT,

    /// <summary>TRN-03: cargo taken off a robot by a person after its request was cancelled.</summary>
    CANCEL_UNLOAD
}
