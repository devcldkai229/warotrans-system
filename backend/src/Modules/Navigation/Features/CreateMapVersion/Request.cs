namespace WaroTrans.Navigation.Features.CreateMapVersion;

/// <summary>
/// Manual metadata create. Prefer ImportMapVersion for ROS map.yaml + map.pgm.
/// Code is generated server-side. Units: Resolution m/px; Origin* meters/radians.
/// </summary>
/// <param name="MapUri">
/// Occupancy raster URI. Optional for metadata-only DRAFT create; server stores pending:// until import/upload.
/// </param>
public sealed record CreateMapVersionRequest(
    string Name,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw,
    string? MapUri = null,
    string? MapYamlUri = null,
    string? PreviewImageUri = null,
    string? FrameId = null,
    int? ImageWidthPixels = null,
    int? ImageHeightPixels = null,
    bool? Negate = null,
    double? OccupiedThreshold = null,
    double? FreeThreshold = null,
    string? ContentHash = null);
