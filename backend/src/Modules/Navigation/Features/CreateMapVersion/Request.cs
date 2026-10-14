namespace WaroTrans.Navigation.Features.CreateMapVersion;

/// <summary>
/// Manual metadata create. Prefer ImportMapVersion for ROS map.yaml + map.pgm.
/// Code is generated server-side. Units: Resolution m/px; Origin* meters/radians.
/// </summary>
public sealed record CreateMapVersionRequest(
    string Name,
    string MapUri,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw,
    string? MapYamlUri = null,
    string? PreviewImageUri = null,
    string? FrameId = null,
    int? ImageWidthPixels = null,
    int? ImageHeightPixels = null,
    bool? Negate = null,
    double? OccupiedThreshold = null,
    double? FreeThreshold = null,
    string? ContentHash = null);
