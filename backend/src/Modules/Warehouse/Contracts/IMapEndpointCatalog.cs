namespace WaroTrans.Warehouse.Contracts;

/// <summary>
/// What Warehouse needs to know about map Endpoints, so a StorageLocation can point at one (rules/02).
/// Warehouse owns this contract and the Navigation module implements it: Navigation already depends on Warehouse,
/// so Warehouse cannot depend on Navigation's own contract without a project reference cycle.
/// </summary>
public interface IMapEndpointCatalog
{
    /// <summary>The Endpoints of the Warehouse's PUBLISHED map version. Empty when no map is published.</summary>
    Task<IReadOnlyList<MapEndpointSnapshot>> GetPublishedEndpointsAsync(
        Guid warehouseId,
        CancellationToken cancellationToken = default);

    /// <summary>Endpoints by id, from any map version (a location keeps pointing at an old map's Endpoint).</summary>
    Task<IReadOnlyList<MapEndpointSnapshot>> GetEndpointsAsync(
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default);
}

public sealed record MapEndpointSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    string EndpointType,
    bool IsEnabled);
