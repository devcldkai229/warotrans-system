using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Registry;

/// <summary>
/// CURRENT_MOVEMENT paths originate from TransportRequestDetail (planning/provisioning),
/// then flow into JobContainer / JobTask.ContextValues for resolution.
/// Paths marked <see cref="CurrentMovementFieldDefinition.IsRequiredCapable"/> may bind to required step inputs.
/// Optional-only paths (storage/level) may only bind to optional inputs.
/// </summary>
public static class CurrentMovementCatalog
{
    public static IReadOnlyList<CurrentMovementFieldDefinition> All { get; } =
    [
        new(
            "containerId",
            WorkflowDataType.UUID,
            "Container",
            "Container associated with the current transport movement. During real Transportation integration this originates from TransportRequestDetail.ContainerId and is carried into runtime movement context during provisioning.",
            IsRequiredCapable: true,
            StaffDescription: "Container selected for this transport movement."),
        new(
            "transportRequestDetailId",
            WorkflowDataType.UUID,
            "Transport request detail",
            "Matching TransportRequestDetail Id (snapshotted into JobTask.ContextValues at container-at-stop scope).",
            IsRequiredCapable: true),
        new(
            "jobContainerId",
            WorkflowDataType.UUID,
            "Job container",
            "JobContainer.Id assigned during provisioning (container-at-stop scope only).",
            IsRequiredCapable: true),
        new(
            "source.endpointId",
            WorkflowDataType.UUID,
            "Source endpoint",
            "Source endpoint from matching TransportRequestDetail (or stop endpoint at PICKUP stop scope).",
            IsRequiredCapable: true),
        new(
            "source.storageLocationId",
            WorkflowDataType.UUID,
            "Source storage location",
            "Source storage location from matching TransportRequestDetail (nullable for point-to-point workflows).",
            IsRequiredCapable: false),
        new(
            "source.levelNo",
            WorkflowDataType.INTEGER,
            "Source level",
            "Source shelf level from matching TransportRequestDetail (nullable; requires source.storageLocationId).",
            IsRequiredCapable: false),
        new(
            "destination.endpointId",
            WorkflowDataType.UUID,
            "Destination endpoint",
            "Destination endpoint from matching TransportRequestDetail (or stop endpoint at DROPOFF stop scope).",
            IsRequiredCapable: true),
        new(
            "destination.storageLocationId",
            WorkflowDataType.UUID,
            "Destination storage location",
            "Destination storage location from matching TransportRequestDetail (nullable for point-to-point workflows).",
            IsRequiredCapable: false),
        new(
            "destination.levelNo",
            WorkflowDataType.INTEGER,
            "Destination level",
            "Destination shelf level from matching TransportRequestDetail (nullable; requires destination.storageLocationId).",
            IsRequiredCapable: false)
    ];

    public static bool TryGet(string path, out CurrentMovementFieldDefinition definition)
    {
        definition = All.FirstOrDefault(x => string.Equals(x.Path, path, StringComparison.Ordinal))!;
        return definition is not null;
    }
}
