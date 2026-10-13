using System.Text.Json;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.WorkflowExecution.Runtime;

public sealed class SystemVariableResolver : ISystemVariableResolver
{
    public bool TryResolve(string key, WorkflowRuntimeContext context, out JsonElement value)
    {
        value = default;
        if (!SystemVariableCatalog.TryGet(key, out _))
        {
            return false;
        }

        Guid? id = key switch
        {
            "assignedRobotId" => context.AssignedRobotId,
            "jobId" => context.JobId,
            "transportRequestId" => context.TransportRequestId,
            "currentUserId" => context.CurrentUserId,
            _ => null
        };

        if (id is null)
        {
            return false;
        }

        value = JsonSerializer.SerializeToElement(id.Value);
        return true;
    }
}
