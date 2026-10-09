using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.UnitTests.Fleet.Features.RobotRegistry;

public class RobotRegisterFactoryTests
{
    [Fact]
    public void Register_sets_defaults()
    {
        var warehouseId = Guid.NewGuid();
        var mapVersionId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        var robot = Robot.Register(warehouseId, mapVersionId, "RBT-042", "Forklift A", now);

        Assert.NotEqual(Guid.Empty, robot.Id);
        Assert.Equal(warehouseId, robot.WarehouseId);
        Assert.Equal(mapVersionId, robot.CurrentMapVersionId);
        Assert.Equal("RBT-042", robot.Code);
        Assert.Equal("Forklift A", robot.Name);
        Assert.Equal(RobotStatus.OFFLINE, robot.Status);
        Assert.True(robot.IsEnabled);
        Assert.False(robot.IsOnline);
        Assert.Equal(0m, robot.BatteryPercent);
        Assert.Equal(0d, robot.PoseX);
        Assert.Equal(0d, robot.PoseY);
        Assert.Equal(0d, robot.PoseYaw);
        Assert.Null(robot.LastHeartbeatAt);
        Assert.Equal(now, robot.CreatedAt);
        Assert.Equal(now, robot.UpdatedAt);
    }
}
