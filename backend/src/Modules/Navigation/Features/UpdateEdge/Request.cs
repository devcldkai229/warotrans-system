using System.Text.Json;

namespace WaroTrans.Navigation.Features.UpdateEdge;

/// <summary>
/// Geometry is GeoJSON LineString in world meters. WidthMeters &gt; 0. MaxSpeed is meters/second.
/// </summary>
public sealed record UpdateEdgeRequest(
    JsonElement Geometry,
    double WidthMeters,
    string Direction,
    int Capacity,
    double? MaxSpeed,
    bool IsActive);
