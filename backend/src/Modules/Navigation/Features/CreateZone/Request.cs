using System.Text.Json;

namespace WaroTrans.Navigation.Features.CreateZone;

/// <summary>
/// Geometry is GeoJSON Polygon in world meters. MaxSpeed is meters/second.
/// Code is optional; when omitted, generated as ZONE-{NAME}.
/// </summary>
public sealed record CreateZoneRequest(
    string Name,
    string ZoneType,
    JsonElement Geometry,
    int Capacity,
    double? MaxSpeed,
    bool? IsActive,
    string? Code = null,
    JsonElement? Policy = null,
    int? PolicySchemaVersion = null);
