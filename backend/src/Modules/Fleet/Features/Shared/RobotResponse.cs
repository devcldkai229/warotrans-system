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
    bool IsOnline,
    decimal BatteryPercent,
    double PoseX,
    double PoseY,
    double PoseYaw,
    DateTimeOffset? LastHeartbeatAt,
    DateTimeOffset? LastTelemetryAt,
    NavigationStatus? NavigationStatus,
    LocalizationStatus? LocalizationStatus,
    double? LinearVelocity,
    double? AngularVelocity,
    string? ErrorCode,
    string? MapVersionCode,
    Guid? CurrentCommandId,
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
        robot.IsOnline,
        robot.BatteryPercent,
        robot.PoseX,
        robot.PoseY,
        robot.PoseYaw,
        robot.LastHeartbeatAt,
        robot.LastTelemetryAt,
        robot.NavigationStatus,
        robot.LocalizationStatus,
        robot.LinearVelocity,
        robot.AngularVelocity,
        robot.ErrorCode,
        robot.MapVersionCode,
        robot.CurrentCommandId,
        robot.IsEnabled,
        robot.CreatedAt,
        robot.UpdatedAt);
}
