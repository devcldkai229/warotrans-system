using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Runtime;

/// <summary>
/// Resolves WorkflowStep.InputBindings into JobStep.ResolvedInputs.
/// Executor must only read ResolvedInputs — never re-query bindings.
/// </summary>
public sealed class StepInputResolver
{
    public Dictionary<string, JsonElement> Resolve(
        StepType stepType,
        string operationCode,
        IReadOnlyDictionary<string, StepInputBinding> bindings,
        IReadOnlyDictionary<string, JsonElement> variableContext,
        CurrentMovementContext? movement,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, JsonElement>> earlierStepOutputs)
    {
        if (!StepTypeRegistry.TryGetOperation(stepType, operationCode, out var operation))
        {
            throw new DomainValidationException(
                $"Unknown operation '{operationCode}' for {stepType}.",
                "unknown_step_operation");
        }

        var resolved = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        foreach (var input in operation.Inputs)
        {
            if (!bindings.TryGetValue(input.Key, out var binding))
            {
                if (input.Required)
                {
                    throw new DomainValidationException(
                        $"Required input '{input.Key}' has no binding.",
                        "missing_input_binding");
                }

                continue;
            }

            var value = ResolveBinding(binding, variableContext, movement, earlierStepOutputs);
            if (!WorkflowDataTypeCompatibility.TryParse(value, input.DataType, out var parseError))
            {
                throw new DomainValidationException(
                    $"Resolved input '{input.Key}' type mismatch: {parseError}",
                    "resolved_input_type_mismatch");
            }

            if (!WorkflowDataTypeCompatibility.IsAllowedValue(value, input.AllowedValues))
            {
                throw new DomainValidationException(
                    $"Resolved input '{input.Key}' is not an allowed value.",
                    "resolved_input_not_allowed");
            }

            resolved[input.Key] = value;
        }

        return resolved;
    }

    private static JsonElement ResolveBinding(
        StepInputBinding binding,
        IReadOnlyDictionary<string, JsonElement> variableContext,
        CurrentMovementContext? movement,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, JsonElement>> earlierStepOutputs)
    {
        switch (binding.SourceType)
        {
            case BindingSourceType.WORKFLOW_VAR:
            {
                if (string.IsNullOrWhiteSpace(binding.SourceReference)
                    || !variableContext.TryGetValue(binding.SourceReference, out var value))
                {
                    throw new DomainValidationException(
                        $"WORKFLOW_VAR '{binding.SourceReference}' is not in variable context.",
                        "workflow_var_unresolved");
                }

                return value;
            }

            case BindingSourceType.CURRENT_MOVEMENT:
            {
                if (movement is null
                    || string.IsNullOrWhiteSpace(binding.SourceReference)
                    || !movement.TryGet(binding.SourceReference, out var raw)
                    || raw is null)
                {
                    throw new DomainValidationException(
                        $"CURRENT_MOVEMENT '{binding.SourceReference}' is unavailable.",
                        "current_movement_unresolved");
                }

                return JsonSerializer.SerializeToElement(raw);
            }

            case BindingSourceType.CONSTANT:
            {
                if (binding.ConstantValue is null
                    || binding.ConstantValue.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                {
                    throw new DomainValidationException(
                        "CONSTANT binding has no constantValue.",
                        "constant_unresolved");
                }

                return binding.ConstantValue.Value;
            }

            case BindingSourceType.STEP_OUTPUT:
            {
                if (string.IsNullOrWhiteSpace(binding.SourceReference)
                    || string.IsNullOrWhiteSpace(binding.OutputKey)
                    || !earlierStepOutputs.TryGetValue(binding.SourceReference, out var outputs)
                    || !outputs.TryGetValue(binding.OutputKey, out var value))
                {
                    throw new DomainValidationException(
                        $"STEP_OUTPUT '{binding.SourceReference}.{binding.OutputKey}' is unavailable.",
                        "step_output_unresolved");
                }

                return value;
            }

            default:
                throw new DomainValidationException(
                    $"Unsupported binding source '{binding.SourceType}'.",
                    "unsupported_binding_source");
        }
    }
}
