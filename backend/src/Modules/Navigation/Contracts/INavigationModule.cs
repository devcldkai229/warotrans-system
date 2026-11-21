using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Contracts;

/// <summary>
/// Read-only public contract for other modules. Returns snapshots, never Navigation entities.
/// </summary>
public interface INavigationModule
{
    Task<MapVersionSnapshot?> GetMapVersionAsync(Guid mapVersionId, CancellationToken cancellationToken = default);

    /// <summary>Published maps in descending publication order for selecting the operating warehouse.</summary>
    Task<IReadOnlyList<MapVersionSnapshot>> GetPublishedMapsAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<MapVersionSnapshot>>([]);

    Task<IReadOnlyList<EndpointSnapshot>> GetEndpointsAsync(
        IReadOnlyCollection<Guid> endpointIds,
        CancellationToken cancellationToken = default);

    /// <summary>FL-08: every endpoint of a map version. Default: none (test doubles).</summary>
    Task<IReadOnlyList<EndpointPoseWithType>> GetEndpointsOnMapAsync(Guid mapVersionId, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<EndpointPoseWithType>>([]);

    /// <summary>Map-frame pose of the endpoint with this code on a map version, or null when there is none.</summary>
    Task<EndpointPoseSnapshot?> GetEndpointPoseByCodeAsync(
        Guid mapVersionId,
        string code,
        CancellationToken cancellationToken = default);

    /// <summary>Map-frame pose of an endpoint (where a robot must stop), or null when unknown.</summary>
    Task<EndpointPoseSnapshot?> GetEndpointPoseAsync(Guid endpointId, CancellationToken cancellationToken = default);

    /// <summary>
    /// An EndpointGroup with its member Endpoints (ordered by code), or null when the id is not a group. A workflow may
    /// name a group where it names an Endpoint; the runtime then picks a free member. Default: none (test doubles).
    /// </summary>
    Task<EndpointGroupSnapshot?> GetEndpointGroupAsync(Guid groupId, CancellationToken cancellationToken = default) =>
        Task.FromResult<EndpointGroupSnapshot?>(null);
}

/// <summary>FIRST_AVAILABLE: the first free member by code; NEAREST: the free member closest to the robot.</summary>
public sealed record EndpointGroupSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    EndpointSelectionPolicy SelectionPolicy,
    bool IsActive,
    IReadOnlyList<EndpointPoseWithType> Members);

public sealed record EndpointPoseSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    double X,
    double Y,
    double Yaw,
    bool IsEnabled,
    double PositionTolerance = 0.25);

public sealed record EndpointPoseWithType(Guid Id, string Code, string Name, EndpointType EndpointType, bool IsEnabled, double X, double Y, double PositionTolerance);

public sealed record MapVersionSnapshot(Guid Id, Guid WarehouseId, int VersionNo, MapStatus Status, string? Code = null);

public sealed record EndpointSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    EndpointType EndpointType,
    bool IsEnabled);
