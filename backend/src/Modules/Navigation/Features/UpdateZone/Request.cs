using System.Text.Json;

namespace WaroTrans.Navigation.Features.UpdateZone;

public sealed record UpdateZoneRequest(
    string Name,
    string ZoneType,
    JsonElement Geometry,
    double? MaxSpeed,
    bool IsActive,
    JsonElement? Policy = null,
    int? PolicySchemaVersion = null);
