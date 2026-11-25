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

    Task<WorkZoneSnapshot?> GetWorkZoneAsync(Guid zoneId, CancellationToken cancellationToken = default) =>
        Task.FromResult<WorkZoneSnapshot?>(null);

    Task<IReadOnlyList<string>> GetWorkZoneCodesAtEndpointAsync(Guid endpointId, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<string>>([]);

    /// <summary>
    /// An EndpointGroup with its member Endpoints (ordered by code), or null when the id is not a group. A workflow may
    /// name a group where it names an Endpoint; the runtime then picks a free member. Default: none (test doubles).
    /// </summary>
    Task<EndpointGroupSnapshot?> GetEndpointGroupAsync(Guid groupId, CancellationToken cancellationToken = default) =>
        Task.FromResult<EndpointGroupSnapshot?>(null);

    /// <summary>
    /// A place a workflow names (an Endpoint or an EndpointGroup id, saved when the workflow was configured on some map
    /// version) on another map version: itself when it is on that map, else the Endpoint / group with the same code
    /// there. Codes are the map-independent identity of a place (EP-{NAME}, kept by clone). Null for an unknown id.
    /// Default (test doubles): the id unchanged, as if it were on the map.
    /// </summary>
    Task<MapPlaceResolution?> ResolvePlaceOnMapAsync(Guid id, Guid mapVersionId, CancellationToken cancellationToken = default) =>
        Task.FromResult<MapPlaceResolution?>(new MapPlaceResolution(id, false, null, id));

    /// <summary>Many places at once (publish check). Unknown ids are left out.</summary>
    async Task<IReadOnlyList<MapPlaceResolution>> ResolvePlacesOnMapAsync(
        IReadOnlyCollection<Guid> ids, Guid mapVersionId, CancellationToken cancellationToken = default)
    {
        var list = new List<MapPlaceResolution>();
        foreach (var id in ids)
        {
            if (await ResolvePlaceOnMapAsync(id, mapVersionId, cancellationToken) is { } resolved) list.Add(resolved);
        }

        return list;
    }
}

/// <summary>
/// <paramref name="SourceId"/> resolved on a map: <paramref name="TargetId"/> is the Endpoint / group to use there, or
/// null when that map has no place with <paramref name="Code"/>.
/// </summary>
public sealed record MapPlaceResolution(Guid SourceId, bool IsGroup, string? Code, Guid? TargetId)
{
    public bool Found => TargetId is not null;
}

public sealed record WorkZoneSnapshot(Guid Id, Guid MapVersionId, string Code);

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

public sealed record EndpointPoseWithType(
    Guid Id, string Code, string Name, EndpointType EndpointType, bool IsEnabled, double X, double Y, double PositionTolerance,
    double? Yaw = null);

public sealed record MapVersionSnapshot(Guid Id, Guid WarehouseId, int VersionNo, MapStatus Status, string? Code = null);

public sealed record EndpointSnapshot(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    EndpointType EndpointType,
    bool IsEnabled);
