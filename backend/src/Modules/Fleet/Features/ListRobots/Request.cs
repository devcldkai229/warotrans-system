using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.ListRobots;

public sealed record ListRobotsRequest(
    Guid? WarehouseId,
    RobotStatus? Status,
    bool? IsEnabled,
    string? Search,
    int Skip = 0,
    int Take = 50);
