using WaroTrans.WorkflowExecution.Contracts;
using WaroTrans.WorkflowExecution.Registry;

namespace WaroTrans.WorkflowExecution.Runtime;

/// <summary>
/// Snapshot used for CURRENT_MOVEMENT bindings, typically from JobTask.ContextValues.
/// Availability of paths depends on <see cref="Scope"/> (JOB / STOP / CONTAINER_AT_STOP).
/// </summary>
public sealed class CurrentMovementContext
{
    /// <summary>
    /// Null means legacy / hand-built context (permissive resolution for older unit tests).
    /// Provisioned JobTasks always set a scope.
    /// </summary>
    public ExecutionScope? Scope { get; init; }

    public JobStopAction? StopAction { get; init; }

    public Guid? ContainerId { get; init; }
    public Guid? TransportRequestDetailId { get; init; }
    public Guid? JobContainerId { get; init; }
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
            "transportRequestDetailId" => TransportRequestDetailId,
            "jobContainerId" => JobContainerId,
            "source.endpointId" => SourceEndpointId,
            "source.storageLocationId" => SourceStorageLocationId,
            "source.levelNo" => SourceLevelNo,
            "destination.endpointId" => DestinationEndpointId,
            "destination.storageLocationId" => DestinationStorageLocationId,
            "destination.levelNo" => DestinationLevelNo,
            _ => null
        };

        var present = path switch
        {
            "containerId" => ContainerId is not null,
            "transportRequestDetailId" => TransportRequestDetailId is not null,
            "jobContainerId" => JobContainerId is not null,
            "source.endpointId" => SourceEndpointId is not null,
            "source.storageLocationId" => SourceStorageLocationId is not null,
            "source.levelNo" => SourceLevelNo is not null,
            "destination.endpointId" => DestinationEndpointId is not null,
            "destination.storageLocationId" => DestinationStorageLocationId is not null,
            "destination.levelNo" => DestinationLevelNo is not null,
            _ => false
        };

        if (!present)
        {
            return false;
        }

        // Legacy contexts (no scope) keep permissive behaviour.
        if (Scope is null)
        {
            return true;
        }

        if (!CurrentMovementCatalog.TryGet(path, out var field))
        {
            return false;
        }

        return field.IsAvailableAt(Scope.Value, StopAction);
    }
}
