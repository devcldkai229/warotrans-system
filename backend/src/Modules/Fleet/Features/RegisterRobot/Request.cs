namespace WaroTrans.Fleet.Features.RegisterRobot;

public sealed record RegisterRobotRequest(
    Guid WarehouseId,
    Guid CurrentMapVersionId,
    string Name);
