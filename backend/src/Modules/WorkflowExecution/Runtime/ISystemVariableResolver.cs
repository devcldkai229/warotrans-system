using System.Text.Json;

namespace WaroTrans.WorkflowExecution.Runtime;

public interface ISystemVariableResolver
{
    bool TryResolve(string key, WorkflowRuntimeContext context, out JsonElement value);
}
