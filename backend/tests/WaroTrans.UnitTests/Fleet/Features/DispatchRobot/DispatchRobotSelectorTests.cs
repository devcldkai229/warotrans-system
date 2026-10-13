using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.DispatchRobot;

namespace WaroTrans.UnitTests.Fleet.Features.DispatchRobot;

public class DispatchRobotSelectorTests
{
    [Fact]
    public void Select_prefers_higher_battery_among_AVAILABLE()
    {
        var robotA = new Robot
        {
            Id = Guid.NewGuid(),
            Code = "RBT-001",
            Status = RobotStatus.AVAILABLE,
            BatteryPercent = 80,
            IsEnabled = true,
            IsOnline = true
        };
        var robotB = new Robot
        {
            Id = Guid.NewGuid(),
            Code = "RBT-002",
            Status = RobotStatus.AVAILABLE,
            BatteryPercent = 15,
            IsEnabled = true,
            IsOnline = true
        };

        var selected = DispatchRobotSelector.Select([robotA, robotB]);

        Assert.Same(robotA, selected);
    }

    [Fact]
    public void Select_ignores_non_AVAILABLE_robots()
    {
        var charging = new Robot
        {
            Code = "RBT-010",
            Status = RobotStatus.CHARGING,
            BatteryPercent = 99,
            IsEnabled = true,
            IsOnline = true
        };
        var available = new Robot
        {
            Code = "RBT-011",
            Status = RobotStatus.AVAILABLE,
            BatteryPercent = 40,
            IsEnabled = true,
            IsOnline = true
        };

        var selected = DispatchRobotSelector.Select([charging, available]);

        Assert.Same(available, selected);
    }
}
