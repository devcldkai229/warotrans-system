using WaroTrans.BuildingBlocks.Exceptions;
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

    public static Robot Register(
        Guid warehouseId,
        Guid currentMapVersionId,
        string code,
        string name,
        DateTimeOffset utcNow)
    {
        return new Robot
        {
            Id = Guid.NewGuid(),
            WarehouseId = warehouseId,
            CurrentMapVersionId = currentMapVersionId,
            Code = code,
            Name = name,
            Status = RobotStatus.OFFLINE,
            BatteryPercent = 0,
            PoseX = 0,
            PoseY = 0,
            PoseYaw = 0,
            IsEnabled = true,
            CreatedAt = utcNow,
            UpdatedAt = utcNow
        };
    }

    public void Enable()
    {
        if (IsEnabled)
        {
            throw new DomainValidationException(
                "Robot is already enabled.",
                "robot_already_enabled");
        }

        IsEnabled = true;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void Disable()
    {
        if (!IsEnabled)
        {
            throw new DomainValidationException(
                "Robot is already disabled.",
                "robot_already_disabled");
        }

        IsEnabled = false;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
