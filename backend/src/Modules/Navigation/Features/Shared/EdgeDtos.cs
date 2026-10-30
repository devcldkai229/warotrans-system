using System.Text.Json;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Features.Shared;

public sealed record EdgeResponse(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    JsonElement Geometry,
    double WidthMeters,
    string Direction,
    double? MaxSpeed,
    bool IsActive)
{
    public static EdgeResponse From(Edge edge) => new(
        edge.Id,
        edge.MapVersionId,
        edge.Code,
        edge.Name,
        edge.Geometry.RootElement.Clone(),
        edge.WidthMeters,
        edge.Direction.ToString(),
        edge.MaxSpeed,
        edge.IsActive);
}
