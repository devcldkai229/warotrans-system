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

    /// <summary>Map-frame pose of an endpoint (where a robot must stop), or null when unknown.</summary>
    Task<EndpointPoseSnapshot?> GetEndpointPoseAsync(Guid endpointId, CancellationToken cancellationToken = default);
}

public sealed record EndpointPoseSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    double X,
    double Y,
    double Yaw,
    bool IsEnabled);

public sealed record MapVersionSnapshot(Guid Id, Guid WarehouseId, int VersionNo, MapStatus Status);

public sealed record EndpointSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    EndpointType EndpointType,
    bool IsEnabled);
