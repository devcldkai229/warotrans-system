using WaroTrans.WorkflowExecution.Contracts;
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

/// <summary>
/// Canonical CURRENT_MOVEMENT path metadata.
/// <see cref="Label"/> is staff/UI facing.
/// <see cref="Description"/> is canonical semantic documentation (metadata API).
/// <see cref="StaffDescription"/> is the shorter request-input-schema copy when set.
/// </summary>
public sealed record CurrentMovementFieldDefinition(
    string Path,
    WorkflowDataType DataType,
    string Label,
    string Description,
    bool IsRequiredCapable = false,
    string? StaffDescription = null)
{
    public string EffectiveStaffDescription => StaffDescription ?? Description;

    /// <summary>
    /// Whether this path may be resolved from a JobTask whose execution scope is <paramref name="scope"/>.
    /// STOP scope only exposes the stop-derived endpoint for the matching action.
    /// </summary>
    public bool IsAvailableAt(ExecutionScope scope, JobStopAction? stopAction)
    {
        return scope switch
        {
            ExecutionScope.ONCE_PER_JOB => false,
            ExecutionScope.ONCE_PER_STOP => Path switch
            {
                "source.endpointId" => stopAction == JobStopAction.PICKUP,
                "destination.endpointId" => stopAction == JobStopAction.DROPOFF,
                _ => false
            },
            ExecutionScope.PER_CONTAINER_AT_STOP => true,
            _ => false
        };
    }
}
