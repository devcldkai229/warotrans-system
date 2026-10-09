namespace WaroTrans.Navigation.Features.UpdateMapVersion;

public sealed record UpdateMapVersionRequest(
    string Name,
    string MapUri,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw
);
