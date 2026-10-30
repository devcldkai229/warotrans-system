using System.Text.Json;

namespace WaroTrans.Navigation.Features.CreateEdge;

/// <summary>
/// Code is generated from Name (EDGE-{NAME}). Geometry is GeoJSON LineString in world meters.
/// WidthMeters &gt; 0. MaxSpeed is meters/second.
/// </summary>
public sealed record CreateEdgeRequest(
    string Name,
    JsonElement Geometry,
    double WidthMeters,
    string Direction,
    double? MaxSpeed,
    bool? IsActive);
