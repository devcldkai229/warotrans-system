namespace WaroTrans.Navigation.Features.UpdateEndpoint;

/// <summary>
/// Code is not editable; it is generated once on create.
/// X/Y are map-frame coordinates in metres; Yaw is in radians.
/// </summary>
public sealed record UpdateEndpointRequest(
    string Name,
    string EndpointType,
    double X,
    double Y,
    double Yaw,
    double PositionTolerance,
    double YawTolerance,
    bool IsEnabled
);
