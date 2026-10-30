using System.Text.Json;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Features.Shared;

public sealed record ZoneResponse(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    string ZoneType,
    JsonElement Geometry,
    double? MaxSpeed,
    bool IsActive,
    JsonElement? Policy,
    int PolicySchemaVersion)
{
    public static ZoneResponse From(Zone zone) => new(
        zone.Id,
        zone.MapVersionId,
        zone.Code,
        zone.Name,
        zone.ZoneType.ToString(),
        zone.Geometry.RootElement.Clone(),
        zone.MaxSpeed,
        zone.IsActive,
        zone.Policy?.RootElement.Clone(),
        zone.PolicySchemaVersion);
}
