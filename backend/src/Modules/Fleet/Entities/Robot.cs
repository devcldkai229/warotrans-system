using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Entities;

public sealed class Robot
{
    public Guid Id { get; set; }
    public Guid WarehouseId { get; set; }
    public Guid CurrentMapVersionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public RobotStatus Status { get; set; }
    public decimal BatteryPercent { get; set; }
    public double PoseX { get; set; }
    public double PoseY { get; set; }
    public double PoseYaw { get; set; }
    public DateTimeOffset? LastHeartbeatAt { get; set; }
    public bool IsEnabled { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
