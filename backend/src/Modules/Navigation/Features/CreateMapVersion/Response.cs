namespace WaroTrans.Navigation.Features.CreateMapVersion;

public sealed record MapVersionResponse(
    Guid Id,
    Guid WarehouseId,
    int VersionNo,
    string Name,
    string Status,
    string MapUri,
    double Resolution,
    double OriginX,
    double OriginY,
    double OriginYaw,
    DateTimeOffset CreatedAt,
    DateTimeOffset? PublishedAt
);
