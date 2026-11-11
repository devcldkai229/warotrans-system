namespace WaroTrans.Warehouse.Contracts;

/// <summary>
/// Write contract for Transportation: a confirmed handover moved a Container, so Warehouse updates its location,
/// status and InventoryStock in its own transaction (WH-01). Safe to call twice: one Job moves a Container once.
/// </summary>
public interface IContainerMovementRecorder
{
    Task RecordPickedUpAsync(ContainerPickup pickup, CancellationToken cancellationToken = default);

    Task RecordDeliveredAsync(ContainerDelivery delivery, CancellationToken cancellationToken = default);
}

public sealed record ContainerPickup(
    Guid ContainerId,
    Guid JobId,
    Guid TransportRequestId);

/// <param name="DestinationStorageLocationId">Null when the Container was dropped at an Endpoint with no shelf (dock, issue point).</param>
/// <param name="DestinationLevelNo">Shelf level; level 1 when the Detail left it empty.</param>
public sealed record ContainerDelivery(
    Guid ContainerId,
    Guid? DestinationStorageLocationId,
    short? DestinationLevelNo,
    Guid JobId,
    Guid TransportRequestId);
