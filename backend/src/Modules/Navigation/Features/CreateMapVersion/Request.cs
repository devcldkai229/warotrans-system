namespace WaroTrans.Navigation.Features.CreateMapVersion;

public sealed record CreateMapVersionRequest(
    string Name,
    string MapUri,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw
);
