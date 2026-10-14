using System.Text.Json;

namespace WaroTrans.Navigation.Features.UpdateZone;

public sealed record UpdateZoneRequest(
    string Name,
    string ZoneType,
    JsonElement Geometry,
    int Capacity,
    double? MaxSpeed,
    bool IsActive,
    JsonElement? Policy = null,
    int? PolicySchemaVersion = null);
