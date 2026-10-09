using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Registry;

/// <summary>
/// Hard-coded source of truth for StepType metadata. Admin cannot invent types/codes/inputs/outputs.
/// </summary>
public static class StepTypeRegistry
{
    private static readonly IReadOnlyList<string> NavigationResults =
        ["SUCCEEDED", "FAILED", "CANCELED", "TIMEOUT"];

    private static readonly IReadOnlyList<string> LoadStates = ["EMPTY", "LOADED"];

    private static readonly IReadOnlyList<string> InspectionResults = ["PASSED", "FAILED"];

    private static readonly IReadOnlyList<string> ResumeReasons =
        ["DURATION_ELAPSED", "EVENT_RECEIVED", "ROBOT_STATE_MATCHED", "TIMEOUT", "CANCELED"];

    private static readonly IReadOnlyList<string> MovePurposes =
        Enum.GetNames<MovePurpose>();

    public static IReadOnlyList<StepTypeDefinition> All { get; } =
    [
        BuildCheck(),
        BuildMove(),
        BuildHumanInteraction(),
        BuildWait()
    ];

    public static StepTypeDefinition Get(StepType stepType) =>
        All.First(x => x.StepType == stepType);

    public static bool TryGetOperation(StepType stepType, string operationCode, out OperationDefinition operation)
    {
        var type = All.FirstOrDefault(x => x.StepType == stepType);
        operation = type?.Operations.FirstOrDefault(o =>
            string.Equals(o.Code, operationCode, StringComparison.Ordinal))!;
        return operation is not null;
    }

    public static OutputDefinition? FindOutput(StepType stepType, string operationCode, string outputKey)
    {
        if (!TryGetOperation(stepType, operationCode, out var op))
        {
            return null;
        }

        return op.Outputs.FirstOrDefault(o => string.Equals(o.Key, outputKey, StringComparison.Ordinal));
    }

    public static InputDefinition? FindInput(StepType stepType, string operationCode, string inputKey)
    {
        if (!TryGetOperation(stepType, operationCode, out var op))
        {
            return null;
        }

        return op.Inputs.FirstOrDefault(i => string.Equals(i.Key, inputKey, StringComparison.Ordinal));
    }

    private static StepTypeDefinition BuildCheck() =>
        new(
            StepType.CHECK,
            "Immediate guard condition before continuing.",
            "conditionCode",
            [
                new OperationDefinition(
                    nameof(CheckConditionCode.ROBOT_READY),
                    "Check robot is ready to accept work.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot to check.")
                    ],
                    [
                        Out("passed", WorkflowDataType.BOOLEAN, "Whether the check passed."),
                        Out("robotStatus", WorkflowDataType.STRING, "Observed robot status."),
                        Out("reason", WorkflowDataType.STRING, "Failure or pass reason."),
                        Out("checkedAt", WorkflowDataType.DATETIME, "Check timestamp.")
                    ]),
                new OperationDefinition(
                    nameof(CheckConditionCode.BATTERY_MIN),
                    "Check robot battery meets minimum percent.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot to check."),
                        In("minimumBatteryPercent", WorkflowDataType.DECIMAL, true, "Required minimum battery percent.")
                    ],
                    [
                        Out("passed", WorkflowDataType.BOOLEAN, "Whether the check passed."),
                        Out("actualBatteryPercent", WorkflowDataType.DECIMAL, "Observed battery percent."),
                        Out("requiredBatteryPercent", WorkflowDataType.DECIMAL, "Required minimum."),
                        Out("reason", WorkflowDataType.STRING, "Failure or pass reason."),
                        Out("checkedAt", WorkflowDataType.DATETIME, "Check timestamp.")
                    ]),
                new OperationDefinition(
                    nameof(CheckConditionCode.ENDPOINT_AVAILABLE),
                    "Check endpoint availability.",
                    [
                        In("endpointId", WorkflowDataType.UUID, true, "Endpoint to check.")
                    ],
                    [
                        Out("passed", WorkflowDataType.BOOLEAN, "Whether the check passed."),
                        Out("endpointStatus", WorkflowDataType.STRING, "Observed endpoint status."),
                        Out("reason", WorkflowDataType.STRING, "Failure or pass reason."),
                        Out("checkedAt", WorkflowDataType.DATETIME, "Check timestamp.")
                    ]),
                new OperationDefinition(
                    nameof(CheckConditionCode.LOAD_STATE),
                    "Check robot load state.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot to check."),
                        In("expectedLoadState", WorkflowDataType.STRING, true, "Expected load state.", LoadStates),
                        In("containerId", WorkflowDataType.UUID, false, "Optional container identity.")
                    ],
                    [
                        Out("passed", WorkflowDataType.BOOLEAN, "Whether the check passed."),
                        Out("actualLoadState", WorkflowDataType.STRING, "Observed load state."),
                        Out("reason", WorkflowDataType.STRING, "Failure or pass reason."),
                        Out("checkedAt", WorkflowDataType.DATETIME, "Check timestamp.")
                    ]),
                new OperationDefinition(
                    nameof(CheckConditionCode.REQUEST_ACTIVE),
                    "Check TransportRequest is still active.",
                    [
                        In("transportRequestId", WorkflowDataType.UUID, true, "TransportRequest to check.")
                    ],
                    [
                        Out("passed", WorkflowDataType.BOOLEAN, "Whether the check passed."),
                        Out("requestStatus", WorkflowDataType.STRING, "Observed request status."),
                        Out("reason", WorkflowDataType.STRING, "Failure or pass reason."),
                        Out("checkedAt", WorkflowDataType.DATETIME, "Check timestamp.")
                    ]),
                new OperationDefinition(
                    nameof(CheckConditionCode.INVENTORY_AVAILABLE),
                    "Check container/inventory availability (prefer containerId in V1).",
                    [
                        In("containerId", WorkflowDataType.UUID, false, "Container to check."),
                        In("productId", WorkflowDataType.UUID, false, "Product to check."),
                        In("sourceStorageLocationId", WorkflowDataType.UUID, false, "Storage location to check."),
                        In("requiredQuantity", WorkflowDataType.INTEGER, false, "Required container count.")
                    ],
                    [
                        Out("passed", WorkflowDataType.BOOLEAN, "Whether the check passed."),
                        Out("availableQuantity", WorkflowDataType.INTEGER, "Available quantity."),
                        Out("requiredQuantity", WorkflowDataType.INTEGER, "Required quantity."),
                        Out("reason", WorkflowDataType.STRING, "Failure or pass reason."),
                        Out("checkedAt", WorkflowDataType.DATETIME, "Check timestamp.")
                    ])
            ]);

    private static StepTypeDefinition BuildMove() =>
        new(
            StepType.MOVE,
            "Request robot navigation to an endpoint. Does not update inventory.",
            "purpose",
            MovePurposes.Select(purpose =>
                new OperationDefinition(
                    purpose,
                    $"Navigate for purpose {purpose}.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot to navigate."),
                        In("targetEndpointId", WorkflowDataType.UUID, true, "Target navigation endpoint."),
                        In("purpose", WorkflowDataType.STRING, true, "Move purpose.", MovePurposes),
                        In("commandTimeoutSeconds", WorkflowDataType.INTEGER, false, "Optional command timeout.")
                    ],
                    [
                        Out("navigationResult", WorkflowDataType.STRING, "Navigation outcome.", NavigationResults),
                        Out("arrivedEndpointId", WorkflowDataType.UUID, "Endpoint arrived at."),
                        Out("startedAt", WorkflowDataType.DATETIME, "Navigation start."),
                        Out("completedAt", WorkflowDataType.DATETIME, "Navigation end."),
                        Out("failureReason", WorkflowDataType.STRING, "Failure reason if any.")
                    ])).ToList());

    private static StepTypeDefinition BuildHumanInteraction()
    {
        var commonOutputs = new List<OutputDefinition>
        {
            Out("confirmed", WorkflowDataType.BOOLEAN, "Whether the action was confirmed."),
            Out("confirmedBy", WorkflowDataType.UUID, "User who confirmed."),
            Out("confirmedAt", WorkflowDataType.DATETIME, "Confirmation timestamp."),
            Out("note", WorkflowDataType.STRING, "Optional note.")
        };

        return new(
            StepType.HUMAN_INTERACTION,
            "Block until Staff/Admin completes a physical/business action.",
            "actionCode",
            [
                Human(
                    nameof(HumanActionCode.PICKUP_CONFIRM),
                    "Confirm container loaded onto robot at pickup.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot at pickup."),
                        In("containerId", WorkflowDataType.UUID, true, "Container being picked up."),
                        In("endpointId", WorkflowDataType.UUID, true, "Pickup endpoint.")
                    ],
                    commonOutputs),
                Human(
                    nameof(HumanActionCode.DROPOFF_CONFIRM),
                    "Confirm container unloaded / delivered at destination.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot at dropoff."),
                        In("containerId", WorkflowDataType.UUID, true, "Container being dropped off."),
                        In("endpointId", WorkflowDataType.UUID, true, "Dropoff endpoint.")
                    ],
                    commonOutputs),
                Human(
                    nameof(HumanActionCode.REPORT_ISSUE),
                    "Report an operational issue during the workflow.",
                    [
                        In("robotId", WorkflowDataType.UUID, false, "Related robot."),
                        In("containerId", WorkflowDataType.UUID, false, "Related container."),
                        In("endpointId", WorkflowDataType.UUID, false, "Related endpoint."),
                        In("issueCategory", WorkflowDataType.STRING, false, "Issue category.")
                    ],
                    [
                        ..commonOutputs,
                        Out("issueId", WorkflowDataType.UUID, "Created issue id."),
                        Out("issueStatus", WorkflowDataType.STRING, "Issue status.")
                    ]),
                Human(
                    nameof(HumanActionCode.PAYLOAD_TRANSFER_CONFIRM),
                    "Confirm payload handover / recovery transfer.",
                    [
                        In("containerId", WorkflowDataType.UUID, true, "Transferred container."),
                        In("fromRobotId", WorkflowDataType.UUID, false, "Source robot."),
                        In("toRobotId", WorkflowDataType.UUID, false, "Destination robot."),
                        In("endpointId", WorkflowDataType.UUID, true, "Transfer endpoint.")
                    ],
                    commonOutputs),
                Human(
                    nameof(HumanActionCode.MAINTENANCE_CONFIRM),
                    "Confirm maintenance action completed.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot under maintenance."),
                        In("endpointId", WorkflowDataType.UUID, false, "Maintenance endpoint.")
                    ],
                    commonOutputs),
                Human(
                    nameof(HumanActionCode.INSPECTION_CONFIRM),
                    "Confirm inspection result.",
                    [
                        In("containerId", WorkflowDataType.UUID, false, "Inspected container."),
                        In("robotId", WorkflowDataType.UUID, false, "Inspected robot."),
                        In("endpointId", WorkflowDataType.UUID, false, "Inspection endpoint.")
                    ],
                    [
                        ..commonOutputs,
                        Out("inspectionResult", WorkflowDataType.STRING, "Inspection result.", InspectionResults)
                    ]),
                Human(
                    nameof(HumanActionCode.CHARGE_CONNECT_CONFIRM),
                    "Confirm robot connected to charger.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot being charged."),
                        In("chargerEndpointId", WorkflowDataType.UUID, true, "Charger endpoint.")
                    ],
                    commonOutputs),
                Human(
                    nameof(HumanActionCode.CHARGE_DISCONNECT_CONFIRM),
                    "Confirm robot disconnected from charger.",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot leaving charger."),
                        In("chargerEndpointId", WorkflowDataType.UUID, true, "Charger endpoint.")
                    ],
                    commonOutputs)
            ]);
    }

    private static StepTypeDefinition BuildWait() =>
        new(
            StepType.WAIT,
            "Suspend execution asynchronously. Not for traffic queueing.",
            "waitMode",
            [
                new OperationDefinition(
                    nameof(WaitMode.DURATION),
                    "Wait for a fixed duration.",
                    [
                        In("durationSeconds", WorkflowDataType.INTEGER, true, "Seconds to wait.")
                    ],
                    [
                        Out("resumeReason", WorkflowDataType.STRING, "Why wait resumed.", ResumeReasons),
                        Out("resumedAt", WorkflowDataType.DATETIME, "Resume timestamp."),
                        Out("actualWaitSeconds", WorkflowDataType.INTEGER, "Actual wait duration.")
                    ]),
                new OperationDefinition(
                    nameof(WaitMode.EVENT),
                    "Wait for an external event (optional timeout).",
                    [
                        In("eventCode", WorkflowDataType.STRING, true, "Expected event code."),
                        In("timeoutSeconds", WorkflowDataType.INTEGER, false, "Optional timeout.")
                    ],
                    [
                        Out("resumeReason", WorkflowDataType.STRING, "Why wait resumed.", ResumeReasons),
                        Out("receivedEventCode", WorkflowDataType.STRING, "Received event code."),
                        Out("resumedAt", WorkflowDataType.DATETIME, "Resume timestamp.")
                    ]),
                new OperationDefinition(
                    nameof(WaitMode.ROBOT_STATE),
                    "Wait until robot reaches an expected state (optional timeout).",
                    [
                        In("robotId", WorkflowDataType.UUID, true, "Robot to observe."),
                        In("expectedRobotState", WorkflowDataType.STRING, true, "Expected robot state."),
                        In("timeoutSeconds", WorkflowDataType.INTEGER, false, "Optional timeout.")
                    ],
                    [
                        Out("resumeReason", WorkflowDataType.STRING, "Why wait resumed.", ResumeReasons),
                        Out("actualRobotState", WorkflowDataType.STRING, "Observed robot state."),
                        Out("resumedAt", WorkflowDataType.DATETIME, "Resume timestamp.")
                    ])
            ]);

    private static InputDefinition In(
        string key,
        WorkflowDataType type,
        bool required,
        string description,
        IReadOnlyList<string>? allowed = null) =>
        new(key, type, required, description, allowed);

    private static OutputDefinition Out(
        string key,
        WorkflowDataType type,
        string description,
        IReadOnlyList<string>? allowed = null) =>
        new(key, type, description, allowed);

    private static OperationDefinition Human(
        string code,
        string description,
        IReadOnlyList<InputDefinition> inputs,
        IReadOnlyList<OutputDefinition> outputs) =>
        new(code, description, inputs, outputs);
}
