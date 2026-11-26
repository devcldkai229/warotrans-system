namespace WaroTrans.WorkflowExecution.Enums;

public enum CheckConditionCode
{
    ROBOT_READY,
    BATTERY_MIN,
    ENDPOINT_AVAILABLE,
    LOAD_STATE,
    REQUEST_ACTIVE,
    INVENTORY_AVAILABLE,
    /// <summary>Before driving into an endpoint: what the way costs, whether it is open, and whether a robot or an obstacle shuts it.</summary>
    ROUTE_CLEAR
}
