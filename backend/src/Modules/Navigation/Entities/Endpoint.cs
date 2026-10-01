using WaroTrans.Navigation.Enums;

namespace WaroTrans.Navigation.Entities;

public sealed class Endpoint
{
    public Guid Id { get; set; }
    public Guid MapVersionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public EndpointType EndpointType { get; set; }
    public double X { get; set; }
    public double Y { get; set; }
    public double Yaw { get; set; }
    public double PositionTolerance { get; set; }
    public double YawTolerance { get; set; }
    public bool IsEnabled { get; set; }
}
