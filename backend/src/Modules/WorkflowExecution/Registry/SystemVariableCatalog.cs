using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Registry;

public static class SystemVariableCatalog
{
    public static IReadOnlyList<SystemVariableDefinition> All { get; } =
    [
        new("assignedRobotId", WorkflowDataType.UUID, "Robot assigned to the current Job."),
        new("jobId", WorkflowDataType.UUID, "Current Job id."),
        new("transportRequestId", WorkflowDataType.UUID, "TransportRequest that produced the Job."),
        new("currentUserId", WorkflowDataType.UUID, "Authenticated user performing the action.")
    ];

    public static bool TryGet(string key, out SystemVariableDefinition definition)
    {
        definition = All.FirstOrDefault(x => string.Equals(x.Key, key, StringComparison.Ordinal))!;
        return definition is not null;
    }
}
