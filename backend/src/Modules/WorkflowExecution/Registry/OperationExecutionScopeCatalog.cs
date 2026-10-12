using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Registry;

/// <summary>
/// Code-only map of (StepType, OperationCode) → execution expansion scope.
/// Source of truth for Job Runtime Provisioner expansion; not persisted on WorkflowStep.
/// </summary>
public static class OperationExecutionScopeCatalog
{
    public static OperationExecutionScopeDefinition Get(StepType stepType, string operationCode)
    {
        if (!TryGet(stepType, operationCode, out var definition))
        {
            throw new DomainValidationException(
                $"No execution scope registered for {stepType}.{operationCode}.",
                "execution_scope_unknown");
        }

        return definition;
    }

    public static bool TryGet(StepType stepType, string operationCode, out OperationExecutionScopeDefinition definition)
    {
        definition = default!;
        if (string.IsNullOrWhiteSpace(operationCode))
        {
            return false;
        }

        definition = (stepType, operationCode) switch
        {
            (StepType.CHECK, nameof(CheckConditionCode.ROBOT_READY)) => OncePerJob(),
            (StepType.CHECK, nameof(CheckConditionCode.BATTERY_MIN)) => OncePerJob(),
            (StepType.CHECK, nameof(CheckConditionCode.REQUEST_ACTIVE)) => OncePerJob(),
            (StepType.CHECK, nameof(CheckConditionCode.LOAD_STATE)) => OncePerJob(),
            (StepType.CHECK, nameof(CheckConditionCode.INVENTORY_AVAILABLE)) => OncePerJob(),
            (StepType.CHECK, nameof(CheckConditionCode.ENDPOINT_AVAILABLE)) =>
                new(ExecutionScope.ONCE_PER_STOP, StopActionFilter: null),

            (StepType.MOVE, nameof(MovePurpose.PICKUP)) => OncePerStop(JobStopAction.PICKUP),
            (StepType.MOVE, nameof(MovePurpose.DROPOFF)) => OncePerStop(JobStopAction.DROPOFF),
            // Non-stop moves are job-level (bound from WORKFLOW_VAR / CONSTANT, not JobBatchPlan stops).
            (StepType.MOVE, nameof(MovePurpose.PARK)) => OncePerJob(),
            (StepType.MOVE, nameof(MovePurpose.CHARGE)) => OncePerJob(),
            (StepType.MOVE, nameof(MovePurpose.TRANSIT)) => OncePerJob(),

            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.PICKUP_CONFIRM)) =>
                PerContainer(JobStopAction.PICKUP),
            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.DROPOFF_CONFIRM)) =>
                PerContainer(JobStopAction.DROPOFF),
            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.PAYLOAD_TRANSFER_CONFIRM)) =>
                PerContainer(JobStopAction.PICKUP),
            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.REPORT_ISSUE)) => OncePerJob(),
            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.MAINTENANCE_CONFIRM)) => OncePerJob(),
            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.INSPECTION_CONFIRM)) => OncePerJob(),
            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.CHARGE_CONNECT_CONFIRM)) => OncePerJob(),
            (StepType.HUMAN_INTERACTION, nameof(HumanActionCode.CHARGE_DISCONNECT_CONFIRM)) => OncePerJob(),

            (StepType.WAIT, _) => OncePerJob(),

            _ => null!
        };

        return definition is not null;
    }

    /// <summary>
    /// Affinity of a WorkflowTask from its MOVE/HUMAN operations (not from TaskKey).
    /// </summary>
    public static JobStopAction? ResolveTaskAffinity(
        IEnumerable<(StepType StepType, string OperationCode)> steps)
    {
        JobStopAction? affinity = null;
        foreach (var (stepType, operationCode) in steps)
        {
            if (!TryGet(stepType, operationCode, out var def) || def.StopActionFilter is null)
            {
                continue;
            }

            if (affinity is null)
            {
                affinity = def.StopActionFilter;
            }
            else if (affinity != def.StopActionFilter)
            {
                // Mixed PICKUP/DROPOFF in one template task — no single affinity.
                return null;
            }
        }

        return affinity;
    }

    /// <summary>
    /// Resolves the stop action filter for a step, falling back to WorkflowTask affinity
    /// when the definition has no explicit filter (e.g. ENDPOINT_AVAILABLE).
    /// Returns null when a stop-scoped step cannot determine PICKUP vs DROPOFF.
    /// </summary>
    public static JobStopAction? TryResolveStopAction(
        OperationExecutionScopeDefinition definition,
        JobStopAction? taskAffinity)
    {
        if (definition.Scope is ExecutionScope.ONCE_PER_JOB)
        {
            return null;
        }

        return definition.StopActionFilter ?? taskAffinity;
    }

    private static OperationExecutionScopeDefinition OncePerJob() =>
        new(ExecutionScope.ONCE_PER_JOB, null);

    private static OperationExecutionScopeDefinition OncePerStop(JobStopAction action) =>
        new(ExecutionScope.ONCE_PER_STOP, action);

    private static OperationExecutionScopeDefinition PerContainer(JobStopAction action) =>
        new(ExecutionScope.PER_CONTAINER_AT_STOP, action);
}
