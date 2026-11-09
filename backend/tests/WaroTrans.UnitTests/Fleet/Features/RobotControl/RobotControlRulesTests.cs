using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.DispatchRobot;
using WaroTrans.Fleet.Features.RobotControl;
using WaroTrans.Fleet.Features.RobotHealth;

namespace WaroTrans.UnitTests.Fleet.Features.RobotControl;

public class RobotControlRulesTests
{
    private static RobotCommand Stop(RobotCommandStatus status, string? outcome = null) =>
        new() { Type = RobotCommandType.STOP, Status = status, Outcome = outcome };

    [Theory]
    [InlineData(RobotCommandStatus.SENT, null, true, StopStates.Requested)]
    [InlineData(RobotCommandStatus.ACKED, null, true, StopStates.Accepted)]
    [InlineData(RobotCommandStatus.COMPLETED, "SUCCEEDED", true, StopStates.StoppedVerified)]
    [InlineData(RobotCommandStatus.COMPLETED, "SUCCEEDED", false, StopStates.StoppedVerified)]
    [InlineData(RobotCommandStatus.REJECTED, null, true, StopStates.Rejected)]
    [InlineData(RobotCommandStatus.FAILED, "FAILED", true, StopStates.Unknown)] // STOP_UNVERIFIED
    [InlineData(RobotCommandStatus.TIMEOUT, null, true, StopStates.Unknown)]
    [InlineData(RobotCommandStatus.SENT, null, false, StopStates.Unknown)]   // robot went offline
    [InlineData(RobotCommandStatus.ACKED, null, false, StopStates.Unknown)]
    public void A_stop_is_never_reported_stopped_without_the_robot_saying_so(
        RobotCommandStatus status, string? outcome, bool online, string expected) =>
        Assert.Equal(expected, RobotControlService.StateOf(Stop(status, outcome), online));

    private static Robot Available(string code)
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), code, code, DateTimeOffset.UtcNow);
        robot.IsOnline = true;
        robot.Status = RobotStatus.AVAILABLE;
        robot.BatteryPercent = 90;
        return robot;
    }

    [Fact]
    public void Held_or_hand_driven_robots_are_never_dispatched()
    {
        var held = Available("A");
        held.MotionHeld = true;
        var driven = Available("B");
        driven.ManualLeaseHolderId = Guid.NewGuid();
        driven.ManualLeaseUntil = DateTimeOffset.UtcNow.AddSeconds(20);
        var free = Available("C");
        free.BatteryPercent = 10;

        Assert.Same(free, DispatchRobotSelector.Select([held, driven, free]));
    }

    [Fact]
    public void An_expired_lease_no_longer_blocks_the_robot()
    {
        var robot = Available("A");
        robot.ManualLeaseHolderId = Guid.NewGuid();
        robot.ManualLeaseUntil = DateTimeOffset.UtcNow.AddSeconds(-1);

        Assert.False(robot.HasActiveManualLease(DateTimeOffset.UtcNow));
        Assert.Same(robot, DispatchRobotSelector.Select([robot]));
    }

    [Fact]
    public void A_finished_command_does_not_end_maintenance()
    {
        var robot = Available("A");
        robot.Status = RobotStatus.MAINTENANCE;

        robot.MarkAvailable(DateTimeOffset.UtcNow);

        Assert.Equal(RobotStatus.MAINTENANCE, robot.Status);
    }

    [Fact]
    public void Capabilities_are_matched_exactly()
    {
        var robot = Available("A");
        robot.Capabilities = "RESTART_STACK, REBOOT";

        Assert.True(robot.Supports("REBOOT"));
        Assert.False(robot.Supports("SHUTDOWN"));
        Assert.False(robot.Supports("reboot"));
    }

    [Fact]
    public void Health_overall_is_the_worst_measured_level()
    {
        static RobotHealthItemDto I(string level) => new("x", level, null, null, null, null);

        Assert.Equal("OK", RobotHealthStore.Overall([I("OK"), I("UNKNOWN")]));
        Assert.Equal("WARN", RobotHealthStore.Overall([I("OK"), I("WARN")]));
        Assert.Equal("ERROR", RobotHealthStore.Overall([I("STALE"), I("ERROR")]));
        Assert.Equal("UNKNOWN", RobotHealthStore.Overall([I("UNKNOWN")]));
        Assert.Equal("UNKNOWN", RobotHealthStore.Overall([]));
    }
}
