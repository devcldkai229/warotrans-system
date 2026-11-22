using System.Text.Json;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Features.Shared;
using WaroTrans.WorkflowExecution.Services;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.IntegrationTests.WorkflowExecution.StandardWorkflows;

/// <summary>
/// The plain two-task INBOUND / OUTBOUND_RETRIEVAL / INTERNAL_RELOCATION the transport tests were written against (no
/// quality inspection, no fixed gates). The product seed lives in backend/seed/workflows; tests keep this one so they do
/// not change when the seed does.
/// </summary>
public static class StandardWorkflowFixtures
{
    public static IReadOnlyList<UpsertWorkflowRequest> Definitions() =>
    [
        Define(
            WorkflowMovementRules.Inbound,
            "INBOUND",
            "Put Containers of a confirmed phiếu nhập away: collect them at the receiving point, deliver each to its shelf.",
            "Put the Container on the robot at the receiving point.",
            "Take the Container off the robot and place it on its shelf."),
        Define(
            WorkflowMovementRules.OutboundRetrieval,
            "Outbound Retrieval",
            "Retrieve an identified Container from its storage source and deliver it to an outbound/shipping point.",
            "Take the Container off its shelf and put it on the robot.",
            "Take the Container off the robot at the outbound point."),
        Define(
            WorkflowMovementRules.InternalRelocation,
            "Internal Relocation",
            "Move an identified Container between two valid internal storage locations.",
            "Take the Container off its current shelf and put it on the robot.",
            "Take the Container off the robot and place it on the new shelf.")
    ];

    private static UpsertWorkflowRequest Define(string code, string name, string description, string pickupText, string dropoffText) =>
        new()
        {
            Code = code,
            Name = name,
            Description = description,
            Variables =
            [
                new WorkflowVariableDefinition
                {
                    Key = "assignedRobotId",
                    Name = "assignedRobotId",
                    DataType = WorkflowDataType.UUID,
                    Source = WorkflowVariableSource.SYSTEM_VALUE,
                    IsRequired = true,
                    Description = "Robot assigned to the current Job.",
                    SequenceNo = 0
                }
            ],
            Tasks =
            [
                StopTask("COLLECT_CONTAINERS", "Collect Containers", 1, "PICKUP", "source.endpointId",
                    "MOVE_TO_PICKUP", "Move to Pickup", "CONFIRM_PICKUP", "Confirm Pickup", "PICKUP_CONFIRM", pickupText),
                StopTask("DELIVER_CONTAINERS", "Deliver Containers", 2, "DROPOFF", "destination.endpointId",
                    "MOVE_TO_DROPOFF", "Move to Dropoff", "CONFIRM_DROPOFF", "Confirm Dropoff", "DROPOFF_CONFIRM", dropoffText)
            ]
        };

    /// <summary>
    /// One MOVE to the stop (expanded once per distinct stop Endpoint: OperationExecutionScopeCatalog MOVE.PICKUP / DROPOFF),
    /// then one confirmation per Container at that stop (PER_CONTAINER_AT_STOP), each bound to its own Container.
    /// </summary>
    private static UpsertWorkflowTaskRequest StopTask(
        string taskKey, string taskName, int sequenceNo, string purpose, string endpointPath,
        string moveKey, string moveName, string confirmKey, string confirmName, string confirmCode, string confirmText) =>
        new()
        {
            TaskKey = taskKey,
            Name = taskName,
            SequenceNo = sequenceNo,
            Steps =
            [
                new UpsertWorkflowStepRequest
                {
                    StepKey = moveKey,
                    Name = moveName,
                    StepType = StepType.MOVE,
                    SequenceNo = 1,
                    OperationCode = purpose,
                    InputBindings = new()
                    {
                        ["robotId"] = Var("assignedRobotId"),
                        ["targetEndpointId"] = Movement(endpointPath),
                        ["purpose"] = Constant(purpose),
                        ["commandTimeoutSeconds"] = Constant(360)
                    },
                    TimeoutSeconds = 360,
                    MaxAttempts = 1,
                    RetryBackoffSeconds = 0,
                    OnFailure = StepFailurePolicy.PAUSE_FOR_OPERATOR
                },
                new UpsertWorkflowStepRequest
                {
                    StepKey = confirmKey,
                    Name = confirmName,
                    StepType = StepType.HUMAN_INTERACTION,
                    SequenceNo = 2,
                    OperationCode = confirmCode,
                    InstructionText = confirmText,
                    InputBindings = new()
                    {
                        ["robotId"] = Var("assignedRobotId"),
                        ["containerId"] = Movement("containerId"),
                        ["endpointId"] = Movement(endpointPath)
                    },
                    TimeoutSeconds = 300,
                    MaxAttempts = 1,
                    RetryBackoffSeconds = 0,
                    OnFailure = StepFailurePolicy.PAUSE_FOR_OPERATOR
                }
            ]
        };

    private static StepInputBinding Var(string key) => new() { SourceType = BindingSourceType.WORKFLOW_VAR, SourceReference = key };

    private static StepInputBinding Movement(string path) => new() { SourceType = BindingSourceType.CURRENT_MOVEMENT, SourceReference = path };

    private static StepInputBinding Constant<T>(T value) => new() { SourceType = BindingSourceType.CONSTANT, ConstantValue = JsonSerializer.SerializeToElement(value) };

}
