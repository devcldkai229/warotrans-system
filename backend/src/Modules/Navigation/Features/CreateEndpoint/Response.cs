namespace WaroTrans.Navigation.Features.CreateEndpoint;

public sealed record EndpointResponse(
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
    bool IsEnabled
);
