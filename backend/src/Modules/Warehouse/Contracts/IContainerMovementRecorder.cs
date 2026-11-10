namespace WaroTrans.Warehouse.Contracts;

/// <summary>
/// Write contract for Transportation: a Container's move was delivered (Detail COMPLETED), so Warehouse updates
/// the Container's location/status and InventoryStock in its own transaction. Safe to call twice for one delivery.
/// </summary>
public interface IContainerMovementRecorder
{
    Task RecordDeliveredAsync(ContainerDelivery delivery, CancellationToken cancellationToken = default);
}

/// <param name="DestinationStorageLocationId">Null when the Container was dropped at an Endpoint with no shelf (dock, inspection).</param>
/// <param name="DestinationLevelNo">Shelf level; level 1 when the Detail left it empty.</param>
public sealed record ContainerDelivery(
    Guid ContainerId,
    Guid? DestinationStorageLocationId,
    short? DestinationLevelNo);
