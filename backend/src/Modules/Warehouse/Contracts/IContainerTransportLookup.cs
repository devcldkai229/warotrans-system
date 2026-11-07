namespace WaroTrans.Warehouse.Contracts;

/// <summary>
/// Which Containers are already being moved, so a stock voucher does not take one a robot is busy with.
/// Warehouse owns this contract and the Transportation module implements it: Transportation already depends on
/// Warehouse, so Warehouse cannot depend on Transportation without a project reference cycle (same as IMapEndpointCatalog).
/// </summary>
public interface IContainerTransportLookup
{
    /// <summary>The given Containers that sit on an open TransportRequest Detail (PENDING, QUEUED or IN_PROGRESS).</summary>
    Task<IReadOnlySet<Guid>> GetContainersInActiveTransportAsync(
        IReadOnlyCollection<Guid> containerIds,
        CancellationToken cancellationToken = default);
}
