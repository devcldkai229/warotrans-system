using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.Charging;

namespace WaroTrans.UnitTests.Fleet;

/// <summary>
/// Manual charging: a person plugs the charger in (CHARGING) and confirms unplugging it (AVAILABLE). Nothing else ends
/// a charge: not a command finishing, not a full battery.
/// </summary>
public sealed class RobotChargingTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;

    private static Robot Idle()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "Robot 01", Now);
        Assert.True(robot.TryApplyHeartbeat(Guid.NewGuid(), 1, Now, Now, out _));
        robot.PutInService(Now);
        return robot;
    }

    [Fact]
    public void Plugging_in_makes_the_robot_charging_and_a_finishing_command_does_not_end_it()
    {
        var robot = Idle();

        robot.StartCharging(Now);
        robot.MarkAvailable(Now.AddMinutes(1));

        Assert.Equal(RobotStatus.CHARGING, robot.Status);
        Assert.Equal(Now, robot.ChargingSince);
    }

    [Fact]
    public void Unplugging_returns_the_robot_to_service_and_clears_the_charge()
    {
        var robot = Idle();
        robot.StartCharging(Now);
        robot.ChargeFullAt = Now.AddMinutes(40);
        robot.ChargeReminderAt = Now.AddMinutes(70);

        robot.EndCharging(Now.AddMinutes(75));

        Assert.Equal(RobotStatus.AVAILABLE, robot.Status);
        Assert.Null(robot.ChargingSince);
        Assert.Null(robot.ChargeFullAt);
        Assert.Null(robot.ChargeReminderAt);
    }

    [Fact]
    public void A_moving_robot_cannot_be_plugged_in_and_a_robot_not_charging_cannot_be_unplugged()
    {
        var moving = Idle();
        moving.ReserveForCommand(Guid.NewGuid(), Now);
        Assert.Equal("robot_busy", Assert.Throws<ConflictException>(() => moving.StartCharging(Now)).Code);

        var idle = Idle();
        Assert.Equal("robot_not_charging", Assert.Throws<ConflictException>(() => idle.EndCharging(Now)).Code);
    }

    [Fact]
    public void Plugging_in_twice_keeps_the_first_charge()
    {
        var robot = Idle();
        robot.StartCharging(Now);

        robot.StartCharging(Now.AddMinutes(5));

        Assert.Equal(Now, robot.ChargingSince);
    }

    [Theory]
    [InlineData(89.9, false)]
    [InlineData(90, true)]
    [InlineData(100, true)]
    public void Full_means_a_measured_battery_at_or_above_the_threshold(double percent, bool full)
    {
        var robot = Idle();
        robot.BatteryPercent = (decimal)percent;
        robot.BatteryMeasuredAt = Now;

        Assert.Equal(full, RobotChargingService.IsFull(robot, 90m));
    }

    [Fact]
    public void A_battery_never_measured_is_not_full()
    {
        var robot = Idle();
        robot.BatteryPercent = 100m;

        Assert.False(RobotChargingService.IsFull(robot, 90m));
    }
}
