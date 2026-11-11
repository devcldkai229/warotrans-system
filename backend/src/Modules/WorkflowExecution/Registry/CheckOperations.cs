using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Registry;

/// <summary>The CHECK operations the engine can evaluate. A workflow using another one is refused at publish.</summary>
public static class CheckOperations
{
    public static IReadOnlySet<string> Executable { get; } = new HashSet<string>(StringComparer.Ordinal)
    {
        nameof(CheckConditionCode.ROBOT_READY),
        nameof(CheckConditionCode.BATTERY_MIN),
        nameof(CheckConditionCode.ENDPOINT_AVAILABLE),
        nameof(CheckConditionCode.REQUEST_ACTIVE),
        nameof(CheckConditionCode.LOAD_STATE),
        nameof(CheckConditionCode.INVENTORY_AVAILABLE)
    };
}
