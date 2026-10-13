using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Validation;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.UnitTests.WorkflowExecution.Fixtures;

/// <summary>
/// INTERNAL_RELOCATION template: HOW only. Movement fields bind via CURRENT_MOVEMENT
/// (not STAFF_INPUT WorkflowVariables).
/// </summary>
public static class InternalRelocationWorkflowFactory
{
    public static WorkflowDefinitionModel CreateValid()
    {
        return new WorkflowDefinitionModel
        {
            Code = "INTERNAL_RELOCATION",
            Name = "Vận chuyển giữa các kệ",
            Description = "Container relocation; movement from TransportRequestDetail via CURRENT_MOVEMENT.",
            Variables =
            [
                Var("minBatteryPercent", "Pin tối thiểu (%)", WorkflowDataType.DECIMAL, WorkflowVariableSource.ADMIN_INPUT, true, 25m, 0),
                Var("assignedRobotId", "Robot được gán", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 1),
                Var("transportRequestId", "TransportRequest", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 2),
                Var("jobId", "Job", WorkflowDataType.UUID, WorkflowVariableSource.SYSTEM_VALUE, true, null, 3)
            ],
            Tasks =
            [
                new WorkflowTaskModel
                {
                    TaskKey = "PICKUP",
                    Name = "Lấy hàng tại kệ nguồn",
                    SequenceNo = 1,
                    Steps =
                    [
                        Step("CHECK_READY", "Kiểm tra robot sẵn sàng", StepType.CHECK, "ROBOT_READY", 1,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId")),
                        Step("CHECK_BATTERY", "Kiểm tra pin tối thiểu", StepType.CHECK, "BATTERY_MIN", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("minimumBatteryPercent", BindingSourceType.WORKFLOW_VAR, "minBatteryPercent")),
                        Step("CHECK_REQUEST", "Kiểm tra request còn hiệu lực", StepType.CHECK, "REQUEST_ACTIVE", 3,
                            Bind("transportRequestId", BindingSourceType.WORKFLOW_VAR, "transportRequestId")),
                        Step("CHECK_SOURCE_ENDPOINT", "Kiểm tra kệ nguồn khả dụng", StepType.CHECK, "ENDPOINT_AVAILABLE", 4,
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId")),
                        Step("MOVE_PICKUP", "Di chuyển tới kệ nguồn", StepType.MOVE, "PICKUP", 5,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"),
                            BindConst("purpose", "PICKUP")),
                        Step("PICKUP_CONFIRM", "Staff xác nhận pickup", StepType.HUMAN_INTERACTION, "PICKUP_CONFIRM", 6,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "source.endpointId"))
                    ]
                },
                new WorkflowTaskModel
                {
                    TaskKey = "DELIVERY",
                    Name = "Giao hàng tại kệ đích",
                    SequenceNo = 2,
                    Steps =
                    [
                        Step("CHECK_DEST_ENDPOINT", "Kiểm tra kệ đích khả dụng", StepType.CHECK, "ENDPOINT_AVAILABLE", 1,
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId")),
                        Step("MOVE_DROPOFF", "Di chuyển tới kệ đích", StepType.MOVE, "DROPOFF", 2,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("targetEndpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"),
                            BindConst("purpose", "DROPOFF")),
                        Step("DROPOFF_CONFIRM", "Staff xác nhận dropoff", StepType.HUMAN_INTERACTION, "DROPOFF_CONFIRM", 3,
                            Bind("robotId", BindingSourceType.WORKFLOW_VAR, "assignedRobotId"),
                            Bind("containerId", BindingSourceType.CURRENT_MOVEMENT, "containerId"),
                            Bind("endpointId", BindingSourceType.CURRENT_MOVEMENT, "destination.endpointId"))
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
        string reference) =>
        (inputKey, new StepInputBinding
        {
            SourceType = sourceType,
            SourceReference = reference
        });

    private static (string, StepInputBinding) BindConst(string inputKey, string value) =>
        (inputKey, new StepInputBinding
        {
            SourceType = BindingSourceType.CONSTANT,
            ConstantValue = JsonSerializer.SerializeToElement(value)
        });
}
