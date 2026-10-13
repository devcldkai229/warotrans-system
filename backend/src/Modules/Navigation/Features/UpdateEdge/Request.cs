namespace WaroTrans.Navigation.Features.UpdateEdge;

/// <summary>
/// Code is not editable; it is generated once on create.
/// Geometry is an ordered polyline in map-frame coordinates (metres); it does not reference Endpoints.
/// </summary>
public sealed record UpdateEdgeRequest(
    EdgeGeometryRequest Geometry,
    string Direction,
    int Capacity,
    double? MaxSpeed,
    bool IsActive
);

public sealed record EdgeGeometryRequest(IReadOnlyList<EdgePointRequest> Points);

public sealed record EdgePointRequest(double X, double Y);
