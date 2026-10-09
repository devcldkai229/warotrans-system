namespace WaroTrans.WorkflowExecution.Runtime;

/// <summary>
/// Snapshot of the active JobContainer + matching TransportRequestDetail fields
/// used for CURRENT_MOVEMENT bindings.
/// </summary>
public sealed class CurrentMovementContext
{
    public Guid? ContainerId { get; init; }
    public Guid? SourceEndpointId { get; init; }
    public Guid? SourceStorageLocationId { get; init; }
    public int? SourceLevelNo { get; init; }
    public Guid? DestinationEndpointId { get; init; }
    public Guid? DestinationStorageLocationId { get; init; }
    public int? DestinationLevelNo { get; init; }

    public bool TryGet(string path, out object? value)
    {
        value = path switch
        {
            "containerId" => ContainerId,
            "source.endpointId" => SourceEndpointId,
            "source.storageLocationId" => SourceStorageLocationId,
            "source.levelNo" => SourceLevelNo,
            "destination.endpointId" => DestinationEndpointId,
            "destination.storageLocationId" => DestinationStorageLocationId,
            "destination.levelNo" => DestinationLevelNo,
            _ => null
        };

        return path switch
        {
            "containerId" => ContainerId is not null,
            "source.endpointId" => SourceEndpointId is not null,
            "source.storageLocationId" => SourceStorageLocationId is not null,
            "source.levelNo" => SourceLevelNo is not null,
            "destination.endpointId" => DestinationEndpointId is not null,
            "destination.storageLocationId" => DestinationStorageLocationId is not null,
            "destination.levelNo" => DestinationLevelNo is not null,
            _ => false
        };
    }
}
