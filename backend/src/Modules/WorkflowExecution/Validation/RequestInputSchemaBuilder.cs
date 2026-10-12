using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.WorkflowExecution.Validation;

/// <summary>
/// Builds the staff-facing request input schema from a workflow definition.
/// Exposes STAFF_INPUT variables and CURRENT_MOVEMENT paths used by bindings.
/// Does not expose ADMIN_INPUT, SYSTEM_VALUE, CONSTANT, or STEP_OUTPUT.
/// </summary>
public static class RequestInputSchemaBuilder
{
    public static WorkflowRequestInputSchema Build(WorkflowDefinitionModel model)
    {
        var workflowInputs = model.Variables
            .Where(v => v.Source == WorkflowVariableSource.STAFF_INPUT)
            .OrderBy(v => v.SequenceNo)
            .Select(v => new RequestInputField(
                v.Key,
                v.DataType.ToString(),
                v.IsRequired,
                string.IsNullOrWhiteSpace(v.Name) ? v.Key : v.Name,
                v.Description))
            .ToList();

        var movementRequired = new Dictionary<string, bool>(StringComparer.Ordinal);

        foreach (var task in model.Tasks)
        {
            foreach (var step in task.Steps)
            {
                if (!StepTypeRegistry.TryGetOperation(step.StepType, step.OperationCode, out var operation))
                {
                    continue;
                }

                foreach (var (inputKey, binding) in step.InputBindings)
                {
                    if (binding.SourceType != BindingSourceType.CURRENT_MOVEMENT
                        || string.IsNullOrWhiteSpace(binding.SourceReference))
                    {
                        continue;
                    }

                    var path = binding.SourceReference;
                    var inputDef = operation.Inputs.FirstOrDefault(i =>
                        string.Equals(i.Key, inputKey, StringComparison.Ordinal));
                    var targetsRequired = inputDef?.Required == true;

                    if (movementRequired.TryGetValue(path, out var alreadyRequired))
                    {
                        movementRequired[path] = alreadyRequired || targetsRequired;
                    }
                    else
                    {
                        movementRequired[path] = targetsRequired;
                    }
                }
            }
        }

        var movementInputs = movementRequired
            .OrderBy(kv => kv.Key, StringComparer.Ordinal)
            .Select(kv =>
            {
                CurrentMovementCatalog.TryGet(kv.Key, out var field);
                var label = field?.Label ?? kv.Key;
                var dataType = field?.DataType.ToString() ?? nameof(WorkflowDataType.UUID);
                var description = field?.EffectiveStaffDescription;
                return new RequestInputField(kv.Key, dataType, kv.Value, label, description);
            })
            .ToList();

        return new WorkflowRequestInputSchema(workflowInputs, movementInputs);
    }
}

public sealed record WorkflowRequestInputSchema(
    IReadOnlyList<RequestInputField> WorkflowInputs,
    IReadOnlyList<RequestInputField> MovementInputs);

public sealed record RequestInputField(
    string Key,
    string DataType,
    bool Required,
    string Label,
    string? Description);
