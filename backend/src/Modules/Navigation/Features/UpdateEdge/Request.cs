using System.Text.Json;

namespace WaroTrans.Navigation.Features.UpdateEdge;

/// <summary>
/// Geometry is GeoJSON LineString in world meters. WidthMeters &gt; 0. MaxSpeed is meters/second.
/// Code is not changed; Name may be updated.
/// </summary>
public sealed record UpdateEdgeRequest(
    string Name,
    JsonElement Geometry,
    double WidthMeters,
    string Direction,
    double? MaxSpeed,
    bool IsActive);
