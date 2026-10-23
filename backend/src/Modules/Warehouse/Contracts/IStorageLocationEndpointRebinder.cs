namespace WaroTrans.Warehouse.Contracts;

/// <summary>
/// Implemented by Warehouse, called by Navigation when a cloned map version is published: the endpoints of the
/// new map replace their source endpoints (new ids, new codes), so storage locations follow them.
/// </summary>
public interface IStorageLocationEndpointRebinder
{
    /// <param name="warehouseId">Only locations of this warehouse are moved.</param>
    /// <param name="endpointMap">Old endpoint id → new endpoint id.</param>
    /// <returns>Number of storage locations re-bound.</returns>
    Task<int> RebindAsync(
        Guid warehouseId,
        IReadOnlyDictionary<Guid, Guid> endpointMap,
        CancellationToken cancellationToken = default);
}
