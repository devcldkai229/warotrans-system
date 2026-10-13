using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Contracts;

/// <summary>
/// Read-only public contract for other modules. Returns snapshots, never Navigation entities.
/// </summary>
public interface INavigationModule
{
    Task<MapVersionSnapshot?> GetMapVersionAsync(Guid mapVersionId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<EndpointSnapshot>> GetEndpointsAsync(
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default);
}

public sealed record MapVersionSnapshot(Guid Id, Guid WarehouseId, int VersionNo, MapStatus Status);

public sealed record EndpointSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    EndpointType EndpointType,
    bool IsEnabled);
