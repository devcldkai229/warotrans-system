namespace WaroTrans.Navigation.Features.PublishMapVersion;

public sealed record PublishMapVersionResponse(
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
