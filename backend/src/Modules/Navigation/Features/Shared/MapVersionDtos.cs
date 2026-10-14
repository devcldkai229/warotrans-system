using System.Text.Json;
using WaroTrans.Navigation.Entities;

namespace WaroTrans.Navigation.Features.Shared;

public sealed record MapVersionResponse(
    Guid Id,
    Guid WarehouseId,
    string Code,
    int VersionNo,
    string Name,
    string Status,
    string MapUri,
    string? MapYamlUri,
    string? PreviewImageUri,
    string FrameId,
    int ImageWidthPixels,
    int ImageHeightPixels,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw,
    bool Negate,
    double OccupiedThreshold,
    double FreeThreshold,
    string? ContentHash,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt)
{
    public static MapVersionResponse From(MapVersion m) => new(
        m.Id,
        m.WarehouseId,
        m.Code,
        m.VersionNo,
        m.Name,
        m.Status.ToString(),
        m.MapUri,
        m.MapYamlUri,
        m.PreviewImageUri,
        m.FrameId,
        m.ImageWidthPixels,
        m.ImageHeightPixels,
        m.Resolution,
        m.OriginX,
        m.OriginY,
        m.OriginYaw,
        m.Negate,
        m.OccupiedThreshold,
        m.FreeThreshold,
        m.ContentHash,
        m.CreatedAt,
        m.PublishedAt);
}

public sealed record MapVersionDetailResponse(
    Guid Id,
    Guid WarehouseId,
    string Code,
    int VersionNo,
    string Name,
    string Status,
    string MapUri,
    string? MapYamlUri,
    string? PreviewImageUri,
    string FrameId,
    int ImageWidthPixels,
    int ImageHeightPixels,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw,
    bool Negate,
    double OccupiedThreshold,
    double FreeThreshold,
    string? ContentHash,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt,
    IReadOnlyList<EndpointListItemDto> Endpoints,
    IReadOnlyList<EdgeListItemDto> Edges,
    IReadOnlyList<ZoneListItemDto> Zones);

public sealed record EndpointListItemDto(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    string EndpointType,
    double X,
    double Y,
    double Yaw,
    double PositionTolerance,
    double YawTolerance,
    bool IsEnabled);

public sealed record EdgeListItemDto(
    Guid Id,
    Guid MapVersionId,
    string Code,
    JsonElement Geometry,
    double WidthMeters,
    string Direction,
    int Capacity,
    double? MaxSpeed,
    bool IsActive);

public sealed record ZoneListItemDto(
    Guid Id,
    Guid MapVersionId,
    string Code,
    string Name,
    string ZoneType,
    JsonElement Geometry,
    int Capacity,
    double? MaxSpeed,
    bool IsActive,
    JsonElement? Policy,
    int PolicySchemaVersion);
