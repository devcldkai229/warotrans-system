using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Fixtures;

public static class InboundPutawayWorkflowFactory
{
    public static WorkflowDefinitionModel CreateValid()
    {
        return new WorkflowDefinitionModel
        {
            Code = "INBOUND_PUTAWAY",
            Name = "Inbound Putaway",
            Description = "Pick up container and put away",
            Variables =
            [
                Var("minBatteryPercent", "Min battery %", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, true, 30m, 0),
                Var("containerId", "Container", WorkflowDataType.UUID, WorkflowVariableSource.STAFF_INPUT, true, null, 1),
                Var("sourceEndpointId", "Source endpoint", WorkflowDataType.UUID, WorkflowVariableSource.STAFF_INPUT, true, null, 2),
                Var("destinationEndpointId", "Destination endpoint", WorkflowDataType.UUID, WorkflowVariableSource.STAFF_INPUT, true, null, 3),
                Var("assignedRobotId", "Assigned robot", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 4),
                Var("transportRequestId", "Transport request", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 5),
                Var("jobId", "Job", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 6)
            ],
            Tasks =
            [
                new WorkflowTaskModel
                {
                    TaskKey = "PICKUP",
                    Name = "Pickup",
                    SequenceNo = 1,
                    Steps =
                    [
                        Step("CHECK_READY", "Check robot ready", StepType.CHECK, "ROBOT_READY", 1,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                        Step("CHECK_BATTERY", "Check battery", StepType.CHECK, "BATTERY_MIN", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("minimumBatteryPercent", BindingSourceType.WORKFLOW_VAR, "minBatteryPercent")),
                        Step("MOVE_PICKUP", "Move to pickup", StepType.MOVE, "PICKUP", 3,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.WORKFLOW_VAR, "sourceEndpointId"),
                            BindConst("purpose", "PICKUP")),
                        Step("PICKUP_CONFIRM", "Confirm pickup", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 4,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.WORKFLOW_VAR, "containerId"),
                            Bind("endpointId", BindingSourceType.WORKFLOW_VAR, "sourceEndpointId"))
                    ]
                },
                new WorkflowTaskModel
                {
                    TaskKey = "DELIVERY",
                    Name = "Delivery",
                    SequenceNo = 2,
                    Steps =
                    [
                        Step("MOVE_DROPOFF", "Move to dropoff", StepType.MOVE, "DROPOFF", 1,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.WORKFLOW_VAR, "destinationEndpointId"),
                            BindConst("purpose", "DROPOFF")),
                        Step("DROPOFF_CONFIRM", "Confirm dropoff", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.WORKFLOW_VAR, "containerId"),
                            Bind("endpointId", BindingSourceType.WORKFLOW_VAR, "destinationEndpointId"))
                    ]
                }
            ]
        };
    }

    private static WorkflowVariableDefinition Var(
        string key,
        string name,
        WorkflowDataType dataType,
        WorkflowVariableSource source,
        bool required,
        object? configured,
        int sequence) =>
        new()
        {
            Key = key,
            Name = name,
            DataType = dataType,
            Source = source,
            IsRequired = required,
            SequenceNo = sequence,
            ConfiguredValue = configured is null ? null : JsonSerializer.SerializeToElement(configured)
        };

    private static WorkflowStepModel Step(
        string key,
        string name,
        StepType type,
        string operation,
        int sequence,
        params (string InputKey, StepInputBinding Binding)[] bindings) =>
        new()
        {
            StepKey = key,
            Name = name,
            StepType = type,
            OperationCode = operation,
            SequenceNo = sequence,
            InputBindings = bindings.ToDictionary(b => b.InputKey, b => b.Binding)
        };

    private static (string, StepInputBinding) Bind(
        string inputKey,
        BindingSourceType sourceType,
        string reference,
        string? outputKey = null) =>
        (inputKey, new StepInputBinding
        {
            SourceType = sourceType,
            SourceReference = reference,
            OutputKey = outputKey
        });

    private static (string, StepInputBinding) BindConst(string inputKey, string value) =>
        (inputKey, new StepInputBinding
        {
            SourceType = BindingSourceType.CONSTANT,
            ConstantValue = JsonSerializer.SerializeToElement(value)
        });
}
