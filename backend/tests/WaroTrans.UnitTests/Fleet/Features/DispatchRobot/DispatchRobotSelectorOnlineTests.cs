using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.DispatchRobot;

namespace WaroTrans.UnitTests.Fleet.Features.DispatchRobot;

public class DispatchRobotSelectorOnlineTests
{
    [Fact]
    public void Select_ignores_offline_AVAILABLE_robots()
    {
        var offline = new Robot
        {
            Code = "RBT-001",
            Status = RobotStatus.AVAILABLE,
            BatteryPercent = 99,
            IsEnabled = true,
            IsOnline = false
        };
        var online = new Robot
        {
            Code = "RBT-002",
            Status = RobotStatus.AVAILABLE,
            BatteryPercent = 40,
            IsEnabled = true,
            IsOnline = true
        };

        var selected = DispatchRobotSelector.Select([offline, online]);

        Assert.Same(online, selected);
    }
}
