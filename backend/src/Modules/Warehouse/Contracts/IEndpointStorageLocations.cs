namespace WaroTrans.Warehouse.Contracts;

/// <summary>
/// Implemented by Warehouse, called by Navigation so the map editor can mark an Endpoint as a storage location:
/// which Endpoints already serve one, which codes are taken, and creating the marked ones when their map is
/// published (a StorageLocation may only point at an Endpoint of the published map).
/// </summary>
public interface IEndpointStorageLocations
{
    /// <summary>The storage locations (active or not) bound to any of these Endpoints.</summary>
    Task<IReadOnlyList<EndpointStorageLocation>> GetByEndpointsAsync(
        Guid warehouseId,
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default);

    /// <summary>The codes (trimmed, upper-cased) already used by a storage location of the warehouse.</summary>
    Task<IReadOnlyList<string>> GetTakenCodesAsync(
        Guid warehouseId,
        IReadOnlyCollection<string> codes,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates every planned location, active, in one save. A taken code or an Endpoint that already serves a
    /// location refuses all of them (409).
    /// </summary>
    Task<IReadOnlyList<EndpointStorageLocation>> CreateAsync(
        Guid warehouseId,
        IReadOnlyList<PlannedStorageLocation> planned,
        CancellationToken cancellationToken = default);
}

public sealed record EndpointStorageLocation(Guid Id, Guid EndpointId, string Code, string Name, bool IsActive);

public sealed record PlannedStorageLocation(Guid EndpointId, string Code, string Name);
