using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.UnitTests.WorkflowExecution.Registry;

public class OperationExecutionScopeCatalogTests
{
    [Theory]
    [InlineData(StepType.CHECK, "ROBOT_READY", ExecutionScope.ONCE_PER_JOB)]
    [InlineData(StepType.CHECK, "BATTERY_MIN", ExecutionScope.ONCE_PER_JOB)]
    [InlineData(StepType.CHECK, "REQUEST_ACTIVE", ExecutionScope.ONCE_PER_JOB)]
    [InlineData(StepType.CHECK, "ENDPOINT_AVAILABLE", ExecutionScope.ONCE_PER_STOP)]
    [InlineData(StepType.MOVE, "PICKUP", ExecutionScope.ONCE_PER_STOP)]
    [InlineData(StepType.MOVE, "DROPOFF", ExecutionScope.ONCE_PER_STOP)]
    [InlineData(StepType.MOVE, "PARK", ExecutionScope.ONCE_PER_JOB)]
    [InlineData(StepType.MOVE, "CHARGE", ExecutionScope.ONCE_PER_JOB)]
    [InlineData(StepType.MOVE, "TRANSIT", ExecutionScope.ONCE_PER_JOB)]
    [InlineData(StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", ExecutionScope.PER_CONTAINER_AT_STOP)]
    [InlineData(StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", ExecutionScope.PER_CONTAINER_AT_STOP)]
    [InlineData(StepType.WAIT, "DURATION", ExecutionScope.ONCE_PER_JOB)]
    public void Get_returns_expected_scope(StepType stepType, string operation, ExecutionScope expected)
    {
        var def = OperationExecutionScopeCatalog.Get(stepType, operation);
        Assert.Equal(expected, def.Scope);
    }

    [Fact]
    public void Every_StepTypeRegistry_operation_has_registered_scope()
    {
        foreach (var stepType in StepTypeRegistry.All)
        {
            foreach (var op in stepType.Operations)
            {
                Assert.True(
                    OperationExecutionScopeCatalog.TryGet(stepType.StepType, op.Code, out _),
                    $"Missing scope for {stepType.StepType}.{op.Code}");
            }
        }
    }

    [Fact]
    public void ResolveTaskAffinity_from_operations_not_keys()
    {
        var affinity = OperationExecutionScopeCatalog.ResolveTaskAffinity(
        [
            (StepType.CHECK, "ENDPOINT_AVAILABLE"),
            (StepType.MOVE, "PICKUP"),
            (StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM")
        ]);

        Assert.Equal(JobStopAction.PICKUP, affinity);
    }

    [Fact]
    public void TryResolveStopAction_falls_back_to_task_affinity()
    {
        var def = OperationExecutionScopeCatalog.Get(StepType.CHECK, "ENDPOINT_AVAILABLE");
        Assert.Null(def.StopActionFilter);
        Assert.Equal(
            JobStopAction.PICKUP,
            OperationExecutionScopeCatalog.TryResolveStopAction(def, JobStopAction.PICKUP));
        Assert.Null(OperationExecutionScopeCatalog.TryResolveStopAction(def, null));
    }
}
