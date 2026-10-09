namespace WaroTrans.Navigation.Features.UpdateEndpoint;

public sealed record UpdateEndpointResponse(
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
