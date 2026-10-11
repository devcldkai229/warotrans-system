namespace WaroTrans.Navigation.Features.CreateEdge;

public sealed record EdgeResponse(
    Guid Id,
    Guid MapVersionId,
    string Code,
    EdgeGeometryResponse Geometry,
    string Direction,
    int Capacity,
    double? MaxSpeed,
    bool IsActive
);

public sealed record EdgeGeometryResponse(IReadOnlyList<EdgePointResponse> Points);

public sealed record EdgePointResponse(double X, double Y);
