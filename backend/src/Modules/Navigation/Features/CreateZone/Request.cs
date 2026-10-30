using System.Text.Json;

namespace WaroTrans.Navigation.Features.CreateZone;

/// <summary>
/// Geometry is GeoJSON Polygon in world meters. MaxSpeed is meters/second.
/// Code is always generated as ZONE-{NAME}.
/// </summary>
public sealed record CreateZoneRequest(
    string Name,
    string ZoneType,
    JsonElement Geometry,
    double? MaxSpeed,
    bool? IsActive,
    JsonElement? Policy = null,
    int? PolicySchemaVersion = null);
