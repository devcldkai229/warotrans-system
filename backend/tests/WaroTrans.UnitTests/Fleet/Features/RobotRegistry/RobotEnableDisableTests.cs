using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.UnitTests.Fleet.Features.RobotRegistry;

public class RobotEnableDisableTests
{
    [Fact]
    public void Disable_from_enabled_sets_IsEnabled_false()
    {
        var robot = CreateEnabledRobot();

        robot.Disable();

        Assert.False(robot.IsEnabled);
    }

    [Fact]
    public void Enable_from_disabled_sets_IsEnabled_true()
    {
        var robot = CreateEnabledRobot();
        robot.Disable();

        robot.Enable();

        Assert.True(robot.IsEnabled);
    }

    [Fact]
    public void Enable_when_already_enabled_throws()
    {
        var robot = CreateEnabledRobot();

        var ex = Assert.Throws<DomainValidationException>(() => robot.Enable());
        Assert.Equal("robot_already_enabled", ex.Code);
    }

    [Fact]
    public void Disable_when_already_disabled_throws()
    {
        var robot = CreateEnabledRobot();
        robot.Disable();

        var ex = Assert.Throws<DomainValidationException>(() => robot.Disable());
        Assert.Equal("robot_already_disabled", ex.Code);
    }

    [Fact]
    public void Enable_Disable_do_not_change_Status()
    {
        var robot = CreateEnabledRobot();
        robot.Status = RobotStatus.EXECUTING;

        robot.Disable();
        Assert.Equal(RobotStatus.EXECUTING, robot.Status);

        robot.Enable();
        Assert.Equal(RobotStatus.EXECUTING, robot.Status);
    }

    private static Robot CreateEnabledRobot() =>
        Robot.Register(
            Guid.NewGuid(),
            Guid.NewGuid(),
            "RBT-001",
            "Test Robot",
            DateTimeOffset.UtcNow);
}
