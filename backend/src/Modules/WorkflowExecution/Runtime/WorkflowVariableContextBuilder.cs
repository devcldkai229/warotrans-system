using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Runtime;

/// <summary>
/// Builds the runtime Job.ContextValues snapshot from ADMIN / STAFF / SYSTEM sources.
/// </summary>
public sealed class WorkflowVariableContextBuilder(ISystemVariableResolver systemVariableResolver)
{
    public Dictionary<string, JsonElement> Build(
        IReadOnlyList<WorkflowVariableDefinition> variables,
        IReadOnlyDictionary<string, JsonElement> staffInputs,
        WorkflowRuntimeContext runtimeContext)
    {
        var context = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        foreach (var variable in variables.OrderBy(v => v.SequenceNo))
        {
            JsonElement? resolved = variable.Source switch
            {
                WorkflowVariableSource.ADMIN_INPUT => variable.ConfiguredValue,
                WorkflowVariableSource.STAFF_INPUT =>
                    staffInputs.TryGetValue(variable.Key, out var staff)
                        ? staff
                        : variable.DefaultValue,
                WorkflowVariableSource.SYSTEM_VALUE =>
                    systemVariableResolver.TryResolve(variable.Key, runtimeContext, out var system)
                        ? system
                        : null,
                _ => null
            };

            if (resolved is null
                || resolved.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            {
                if (variable.IsRequired)
                {
                    throw new DomainValidationException(
                        $"Required workflow variable '{variable.Key}' is missing.",
                        "workflow_variable_missing");
                }

                continue;
            }

            context[variable.Key] = resolved.Value;
        }

        return context;
    }
}
