using WaroTrans.WorkflowExecution.Enums;

namespace WaroTrans.WorkflowExecution.Registry;

/// <summary>
/// CURRENT_MOVEMENT paths bind from the active JobContainer and matching TransportRequestDetail fields.
/// </summary>
public static class CurrentMovementCatalog
{
    public static IReadOnlyList<CurrentMovementFieldDefinition> All { get; } =
    [
        new("containerId", WorkflowDataType.UUID, "Active JobContainer.ContainerId."),
        new("source.endpointId", WorkflowDataType.UUID, "Source endpoint from matching Detail."),
        new("source.storageLocationId", WorkflowDataType.UUID, "Source storage location from matching Detail."),
        new("source.levelNo", WorkflowDataType.INTEGER, "Source level from matching Detail."),
        new("destination.endpointId", WorkflowDataType.UUID, "Destination endpoint from matching Detail."),
        new("destination.storageLocationId", WorkflowDataType.UUID, "Destination storage location from matching Detail."),
        new("destination.levelNo", WorkflowDataType.INTEGER, "Destination level from matching Detail.")
    ];

    public static bool TryGet(string path, out CurrentMovementFieldDefinition definition)
    {
        definition = All.FirstOrDefault(x => string.Equals(x.Path, path, StringComparison.Ordinal))!;
        return definition is not null;
    }
}
