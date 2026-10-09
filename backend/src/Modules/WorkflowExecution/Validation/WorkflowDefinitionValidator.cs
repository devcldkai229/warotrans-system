using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Registry;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Validation;

public static class WorkflowDefinitionValidator
{
    public static WorkflowDefinitionValidationResult ValidateDraft(WorkflowDefinitionModel model)
    {
        var result = new WorkflowDefinitionValidationResult();
        ValidateStructure(model, result, full: false);
        return result;
    }

    public static WorkflowDefinitionValidationResult ValidateForPublish(WorkflowDefinitionModel model)
    {
        var result = new WorkflowDefinitionValidationResult();
        ValidateStructure(model, result, full: true);
        return result;
    }

    private static void ValidateStructure(
        WorkflowDefinitionModel model,
        WorkflowDefinitionValidationResult result,
        bool full)
    {
        if (string.IsNullOrWhiteSpace(model.Code))
        {
            result.Add("code", "Code is required.");
        }

        if (string.IsNullOrWhiteSpace(model.Name))
        {
            result.Add("name", "Name is required.");
        }

        ValidateVariables(model.Variables, result, full);
        ValidateTasks(model, result, full);
    }

    private static void ValidateVariables(
        List<WorkflowVariableDefinition> variables,
        WorkflowDefinitionValidationResult result,
        bool full)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < variables.Count; i++)
        {
            var path = $"variables[{i}]";
            var variable = variables[i];

            if (string.IsNullOrWhiteSpace(variable.Key))
            {
                result.Add($"{path}.key", "Variable key is required.");
                continue;
            }

            if (!seen.Add(variable.Key))
            {
                result.Add($"{path}.key", $"Duplicate variable key '{variable.Key}'.");
            }

            if (string.IsNullOrWhiteSpace(variable.Name))
            {
                result.Add($"{path}.name", "Variable name is required.");
            }

            if (!Enum.IsDefined(variable.DataType))
            {
                result.Add($"{path}.dataType", $"Unknown data type '{variable.DataType}'.");
            }

            if (!Enum.IsDefined(variable.Source))
            {
                result.Add($"{path}.source", $"Unknown source '{variable.Source}'.");
            }

            if (!full)
            {
                continue;
            }

            switch (variable.Source)
            {
                case WorkflowVariableSource.ADMIN_INPUT:
                    if (variable.ConfiguredValue is null
                        || variable.ConfiguredValue.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                    {
                        result.Add($"{path}.configuredValue", "ADMIN_INPUT requires configuredValue.");
                    }
                    else if (!WorkflowDataTypeCompatibility.TryParse(
                                 variable.ConfiguredValue.Value,
                                 variable.DataType,
                                 out var adminError))
                    {
                        result.Add($"{path}.configuredValue", adminError ?? "Invalid configuredValue type.");
                    }

                    break;

                case WorkflowVariableSource.STAFF_INPUT:
                    if (HasJsonValue(variable.ConfiguredValue))
                    {
                        result.Add($"{path}.configuredValue", "STAFF_INPUT must not have configuredValue.");
                    }

                    break;

                case WorkflowVariableSource.SYSTEM_VALUE:
                    if (!SystemVariableCatalog.TryGet(variable.Key, out var systemDef))
                    {
                        result.Add($"{path}.key", $"Unknown SYSTEM_VALUE key '{variable.Key}'.");
                    }
                    else if (systemDef.DataType != variable.DataType)
                    {
                        result.Add(
                            $"{path}.dataType",
                            $"SYSTEM_VALUE '{variable.Key}' must be {systemDef.DataType}.");
                    }

                    if (HasJsonValue(variable.ConfiguredValue))
                    {
                        result.Add($"{path}.configuredValue", "SYSTEM_VALUE must not have configuredValue.");
                    }

                    break;
            }

            if (HasJsonValue(variable.DefaultValue)
                && !WorkflowDataTypeCompatibility.TryParse(
                    variable.DefaultValue!.Value,
                    variable.DataType,
                    out var defaultError))
            {
                result.Add($"{path}.defaultValue", defaultError ?? "Invalid defaultValue type.");
            }
        }
    }

    private static bool HasJsonValue(JsonElement? value) =>
        value is { } el && el.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined;

    private static void ValidateTasks(
        WorkflowDefinitionModel model,
        WorkflowDefinitionValidationResult result,
        bool full)
    {
        var taskKeys = new HashSet<string>(StringComparer.Ordinal);
        var globalStepKeys = new HashSet<string>(StringComparer.Ordinal);
        var stepIndex = BuildStepExecutionIndex(model.Tasks);

        for (var ti = 0; ti < model.Tasks.Count; ti++)
        {
            var task = model.Tasks[ti];
            var taskPath = $"tasks[{ti}]";

            if (string.IsNullOrWhiteSpace(task.TaskKey))
            {
                result.Add($"{taskPath}.taskKey", "Task key is required.");
            }
            else if (!taskKeys.Add(task.TaskKey))
            {
                result.Add($"{taskPath}.taskKey", $"Duplicate task key '{task.TaskKey}'.");
            }

            if (string.IsNullOrWhiteSpace(task.Name))
            {
                result.Add($"{taskPath}.name", "Task name is required.");
            }

            for (var si = 0; si < task.Steps.Count; si++)
            {
                var step = task.Steps[si];
                var stepPath = $"{taskPath}.steps[{si}]";

                if (!string.IsNullOrWhiteSpace(step.StepKey) && !globalStepKeys.Add(step.StepKey))
                {
                    result.Add($"{stepPath}.stepKey", $"Duplicate step key '{step.StepKey}' within workflow.");
                }

                ValidateStep(step, stepPath, model.Variables, stepIndex, result, full);
            }
        }

        if (full && model.Tasks.Count == 0)
        {
            result.Add("tasks", "Published workflow must have at least one task.");
        }
    }

    private static void ValidateStep(
        WorkflowStepModel step,
        string stepPath,
        List<WorkflowVariableDefinition> variables,
        IReadOnlyDictionary<string, (int TaskSeq, int StepSeq, StepType StepType, string OperationCode)> stepIndex,
        WorkflowDefinitionValidationResult result,
        bool full)
    {
        if (string.IsNullOrWhiteSpace(step.StepKey))
        {
            result.Add($"{stepPath}.stepKey", "Step key is required.");
        }

        if (string.IsNullOrWhiteSpace(step.Name))
        {
            result.Add($"{stepPath}.name", "Step name is required.");
        }

        if (!Enum.IsDefined(step.StepType))
        {
            result.Add($"{stepPath}.stepType", $"Unknown StepType '{step.StepType}'.");
            return;
        }

        if (!Enum.IsDefined(step.OnFailure))
        {
            result.Add($"{stepPath}.onFailure", $"Unknown failure policy '{step.OnFailure}'.");
        }

        if (!full)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(step.OperationCode))
        {
            result.Add($"{stepPath}.operationCode", "Operation code is required.");
            return;
        }

        if (!StepTypeRegistry.TryGetOperation(step.StepType, step.OperationCode, out var operation))
        {
            result.Add(
                $"{stepPath}.operationCode",
                $"Operation '{step.OperationCode}' is not allowed for {step.StepType}.");
            return;
        }

        if (step.StepType == StepType.CHECK
            && string.Equals(step.OperationCode, nameof(CheckConditionCode.INVENTORY_AVAILABLE), StringComparison.Ordinal))
        {
            ValidateInventoryAvailableBindings(step, stepPath, result);
        }

        foreach (var binding in step.InputBindings)
        {
            var inputDef = operation.Inputs.FirstOrDefault(i =>
                string.Equals(i.Key, binding.Key, StringComparison.Ordinal));
            if (inputDef is null)
            {
                result.Add(
                    $"{stepPath}.inputBindings.{binding.Key}",
                    $"Input '{binding.Key}' is not defined for {step.StepType}/{step.OperationCode}.");
                continue;
            }

            ValidateBinding(
                binding.Key,
                binding.Value,
                inputDef,
                $"{stepPath}.inputBindings.{binding.Key}",
                variables,
                step,
                stepIndex,
                result);
        }

        foreach (var required in operation.Inputs.Where(i => i.Required))
        {
            if (!step.InputBindings.ContainsKey(required.Key))
            {
                result.Add(
                    $"{stepPath}.inputBindings.{required.Key}",
                    $"Required input '{required.Key}' is missing a binding.");
            }
        }
    }

    private static void ValidateInventoryAvailableBindings(
        WorkflowStepModel step,
        string stepPath,
        WorkflowDefinitionValidationResult result)
    {
        var hasContainer = step.InputBindings.ContainsKey("containerId");
        var hasProduct = step.InputBindings.ContainsKey("productId");
        var hasLocation = step.InputBindings.ContainsKey("sourceStorageLocationId");
        if (!hasContainer && !hasProduct && !hasLocation)
        {
            result.Add(
                $"{stepPath}.inputBindings",
                "INVENTORY_AVAILABLE requires at least one of containerId, productId, or sourceStorageLocationId.");
        }
    }

    private static void ValidateBinding(
        string inputKey,
        StepInputBinding binding,
        InputDefinition inputDef,
        string path,
        List<WorkflowVariableDefinition> variables,
        WorkflowStepModel currentStep,
        IReadOnlyDictionary<string, (int TaskSeq, int StepSeq, StepType StepType, string OperationCode)> stepIndex,
        WorkflowDefinitionValidationResult result)
    {
        if (!Enum.IsDefined(binding.SourceType))
        {
            result.Add($"{path}.sourceType", $"Unknown binding source '{binding.SourceType}'.");
            return;
        }

        switch (binding.SourceType)
        {
            case BindingSourceType.WORKFLOW_VAR:
            {
                if (string.IsNullOrWhiteSpace(binding.SourceReference))
                {
                    result.Add($"{path}.sourceReference", "WORKFLOW_VAR requires sourceReference.");
                    break;
                }

                var variable = variables.FirstOrDefault(v =>
                    string.Equals(v.Key, binding.SourceReference, StringComparison.Ordinal));
                if (variable is null)
                {
                    result.Add($"{path}.sourceReference", $"Unknown variable '{binding.SourceReference}'.");
                    break;
                }

                if (!WorkflowDataTypeCompatibility.AreCompatible(variable.DataType, inputDef.DataType))
                {
                    result.Add(
                        path,
                        $"Variable '{variable.Key}' type {variable.DataType} is incompatible with input {inputDef.DataType}.");
                }

                break;
            }

            case BindingSourceType.CURRENT_MOVEMENT:
            {
                if (string.IsNullOrWhiteSpace(binding.SourceReference))
                {
                    result.Add($"{path}.sourceReference", "CURRENT_MOVEMENT requires sourceReference path.");
                    break;
                }

                if (!CurrentMovementCatalog.TryGet(binding.SourceReference, out var field))
                {
                    result.Add($"{path}.sourceReference", $"Unknown CURRENT_MOVEMENT path '{binding.SourceReference}'.");
                    break;
                }

                if (!WorkflowDataTypeCompatibility.AreCompatible(field.DataType, inputDef.DataType))
                {
                    result.Add(
                        path,
                        $"CURRENT_MOVEMENT '{field.Path}' type {field.DataType} is incompatible with input {inputDef.DataType}.");
                }

                break;
            }

            case BindingSourceType.CONSTANT:
            {
                if (binding.ConstantValue is null
                    || binding.ConstantValue.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                {
                    result.Add($"{path}.constantValue", "CONSTANT requires constantValue.");
                    break;
                }

                if (!WorkflowDataTypeCompatibility.TryParse(
                        binding.ConstantValue.Value,
                        inputDef.DataType,
                        out var parseError))
                {
                    result.Add($"{path}.constantValue", parseError ?? "Invalid constantValue type.");
                    break;
                }

                if (!WorkflowDataTypeCompatibility.IsAllowedValue(binding.ConstantValue.Value, inputDef.AllowedValues))
                {
                    result.Add(
                        $"{path}.constantValue",
                        $"constantValue is not in allowed values for '{inputKey}'.");
                }

                break;
            }

            case BindingSourceType.STEP_OUTPUT:
            {
                if (string.IsNullOrWhiteSpace(binding.SourceReference))
                {
                    result.Add($"{path}.sourceReference", "STEP_OUTPUT requires sourceReference (stepKey).");
                    break;
                }

                if (string.IsNullOrWhiteSpace(binding.OutputKey))
                {
                    result.Add($"{path}.outputKey", "STEP_OUTPUT requires outputKey.");
                    break;
                }

                if (!stepIndex.TryGetValue(binding.SourceReference, out var sourceStep))
                {
                    result.Add($"{path}.sourceReference", $"Unknown step '{binding.SourceReference}'.");
                    break;
                }

                if (!stepIndex.TryGetValue(currentStep.StepKey, out var current))
                {
                    result.Add(path, "Current step is not indexed for STEP_OUTPUT validation.");
                    break;
                }

                if (sourceStep.TaskSeq > current.TaskSeq
                    || (sourceStep.TaskSeq == current.TaskSeq && sourceStep.StepSeq >= current.StepSeq))
                {
                    result.Add(
                        path,
                        $"STEP_OUTPUT '{binding.SourceReference}.{binding.OutputKey}' must reference an earlier step.");
                    break;
                }

                var output = StepTypeRegistry.FindOutput(
                    sourceStep.StepType,
                    sourceStep.OperationCode,
                    binding.OutputKey);
                if (output is null)
                {
                    result.Add(
                        $"{path}.outputKey",
                        $"Output '{binding.OutputKey}' is not defined on step '{binding.SourceReference}'.");
                    break;
                }

                if (!WorkflowDataTypeCompatibility.AreCompatible(output.DataType, inputDef.DataType))
                {
                    result.Add(
                        path,
                        $"STEP_OUTPUT '{binding.OutputKey}' type {output.DataType} is incompatible with input {inputDef.DataType}.");
                }

                break;
            }
        }
    }

    private static Dictionary<string, (int TaskSeq, int StepSeq, StepType StepType, string OperationCode)>
        BuildStepExecutionIndex(List<WorkflowTaskModel> tasks)
    {
        var map = new Dictionary<string, (int, int, StepType, string)>(StringComparer.Ordinal);
        foreach (var task in tasks.OrderBy(t => t.SequenceNo))
        {
            foreach (var step in task.Steps.OrderBy(s => s.SequenceNo))
            {
                if (string.IsNullOrWhiteSpace(step.StepKey))
                {
                    continue;
                }

                // First wins; duplicates caught per-task; cross-task duplicates overwrite then validator may miss —
                // enforce uniqueness here by skipping if already present is wrong; store and let caller check.
                map[step.StepKey] = (task.SequenceNo, step.SequenceNo, step.StepType, step.OperationCode);
            }
        }

        return map;
    }
}
