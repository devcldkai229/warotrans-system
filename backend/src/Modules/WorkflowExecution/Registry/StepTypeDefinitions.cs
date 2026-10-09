using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Registry;

public sealed record InputDefinition(
    string Key,
    WorkflowDataType DataType,
    bool Required,
    string Description,
    IReadOnlyList<string>? AllowedValues = null);

public sealed record OutputDefinition(
    string Key,
    WorkflowDataType DataType,
    string Description,
    IReadOnlyList<string>? AllowedValues = null);

public sealed record OperationDefinition(
    string Code,
    string Description,
    IReadOnlyList<InputDefinition> Inputs,
    IReadOnlyList<OutputDefinition> Outputs);

public sealed record StepTypeDefinition(
    StepType StepType,
    string Description,
    string OperationFieldName,
    IReadOnlyList<OperationDefinition> Operations);

public sealed record SystemVariableDefinition(
    string Key,
    WorkflowDataType DataType,
    string Description);

public sealed record CurrentMovementFieldDefinition(
    string Path,
    WorkflowDataType DataType,
    string Description);
