using System.Text.Json;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Features.Shared;

public sealed record EdgeResponse(
    Guid Id,
    Guid MapVersionId,
    string Code,
    JsonElement Geometry,
    double WidthMeters,
    string Direction,
    int Capacity,
    double? MaxSpeed,
    bool IsActive)
{
    public static EdgeResponse From(Edge edge) => new(
        edge.Id,
        edge.MapVersionId,
        edge.Code,
        edge.Geometry.RootElement.Clone(),
        edge.WidthMeters,
        edge.Direction.ToString(),
        edge.Capacity,
        edge.MaxSpeed,
        edge.IsActive);
}
