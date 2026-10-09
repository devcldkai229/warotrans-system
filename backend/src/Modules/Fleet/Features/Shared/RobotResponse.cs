using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.Shared;

public sealed record RobotResponse(
    Guid Id,
    Guid WarehouseId,
    Guid CurrentMapVersionId,
    string Code,
    string Name,
    RobotStatus Status,
    decimal BatteryPercent,
    double PoseX,
    double PoseY,
    double PoseYaw,
    DateTimeOffset? LastHeartbeatAt,
    bool IsEnabled,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static RobotResponse From(Robot robot) => new(
        robot.Id,
        robot.WarehouseId,
        robot.CurrentMapVersionId,
        robot.Code,
        robot.Name,
        robot.Status,
        robot.BatteryPercent,
        robot.PoseX,
        robot.PoseY,
        robot.PoseYaw,
        robot.LastHeartbeatAt,
        robot.IsEnabled,
        robot.CreatedAt,
        robot.UpdatedAt);
}
