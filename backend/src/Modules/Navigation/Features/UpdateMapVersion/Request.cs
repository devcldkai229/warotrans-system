namespace WaroTrans.Navigation.Features.UpdateMapVersion;

/// <summary>
/// Units: Resolution m/px; OriginX/Y meters; OriginYaw radians.
/// </summary>
public sealed record UpdateMapVersionRequest(
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
