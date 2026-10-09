using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.UnitTests.Fleet.Features.RobotTelemetry;

public class RobotHeartbeatTelemetryDomainTests
{
    [Fact]
    public void ApplyHeartbeat_sets_online_without_changing_Status()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "A", DateTimeOffset.UtcNow);
        Assert.Equal(RobotStatus.OFFLINE, robot.Status);

        var applied = robot.TryApplyHeartbeat(Guid.NewGuid(), 1, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, out var becameOnline);

        Assert.True(applied);
        Assert.True(becameOnline);
        Assert.True(robot.IsOnline);
        Assert.Equal(RobotStatus.OFFLINE, robot.Status);
    }

    [Fact]
    public void ApplyHeartbeat_ignores_stale_sequence()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "A", DateTimeOffset.UtcNow);
        var boot = Guid.NewGuid();
        Assert.True(robot.TryApplyHeartbeat(boot, 5, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, out _));

        var applied = robot.TryApplyHeartbeat(boot, 4, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, out var becameOnline);

        Assert.False(applied);
        Assert.False(becameOnline);
        Assert.Equal(5, robot.LastHeartbeatSequence);
    }

    [Fact]
    public void ApplyHeartbeat_accepts_new_bootId()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "A", DateTimeOffset.UtcNow);
        Assert.True(robot.TryApplyHeartbeat(Guid.NewGuid(), 10, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, out _));

        var applied = robot.TryApplyHeartbeat(Guid.NewGuid(), 1, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, out _);

        Assert.True(applied);
        Assert.Equal(1, robot.LastHeartbeatSequence);
    }

    [Fact]
    public void MarkOffline_clears_online_keeps_Status()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "A", DateTimeOffset.UtcNow);
        robot.Status = RobotStatus.EXECUTING;
        robot.TryApplyHeartbeat(Guid.NewGuid(), 1, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, out _);

        Assert.True(robot.MarkOffline(DateTimeOffset.UtcNow));
        Assert.False(robot.IsOnline);
        Assert.Equal(RobotStatus.EXECUTING, robot.Status);
        Assert.False(robot.MarkOffline(DateTimeOffset.UtcNow));
    }

    [Fact]
    public void ApplyTelemetry_updates_pose_not_Status_or_IsOnline()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "A", DateTimeOffset.UtcNow);
        robot.Status = RobotStatus.RESERVED;

        var applied = robot.TryApplyTelemetry(
            Guid.NewGuid(),
            1,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow,
            1.5,
            2.5,
            0.3,
            77.5m,
            NavigationStatus.NAVIGATING,
            LocalizationStatus.LOCALIZED,
            0.4,
            0.1,
            "MAP-1",
            null,
            null);

        Assert.True(applied);
        Assert.False(robot.IsOnline);
        Assert.Equal(RobotStatus.RESERVED, robot.Status);
        Assert.Equal(1.5, robot.PoseX);
        Assert.Equal(2.5, robot.PoseY);
        Assert.Equal(0.3, robot.PoseYaw);
        Assert.Equal(77.5m, robot.BatteryPercent);
        Assert.Equal(NavigationStatus.NAVIGATING, robot.NavigationStatus);
        Assert.Equal(LocalizationStatus.LOCALIZED, robot.LocalizationStatus);
    }

    [Fact]
    public void ApplyTelemetry_ignores_stale_does_not_rollback_pose()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "A", DateTimeOffset.UtcNow);
        var boot = Guid.NewGuid();
        Assert.True(robot.TryApplyTelemetry(
            boot, 2, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow,
            9, 8, 7, 50m, NavigationStatus.IDLE, LocalizationStatus.LOCALIZED,
            0, 0, null, null, null));

        var applied = robot.TryApplyTelemetry(
            boot, 1, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow,
            0, 0, 0, 10m, NavigationStatus.FAILED, LocalizationStatus.LOST,
            0, 0, null, null, null);

        Assert.False(applied);
        Assert.Equal(9, robot.PoseX);
        Assert.Equal(50m, robot.BatteryPercent);
        Assert.Equal(NavigationStatus.IDLE, robot.NavigationStatus);
    }

    [Fact]
    public void ApplyTelemetry_null_pose_and_battery_when_LOST_does_not_overwrite_pose()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "A", DateTimeOffset.UtcNow);
        var boot = Guid.NewGuid();
        Assert.True(robot.TryApplyTelemetry(
            boot, 1, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow,
            3, 4, 0.5, 60m, NavigationStatus.IDLE, LocalizationStatus.LOCALIZED,
            0, 0, null, null, null));

        Assert.True(robot.TryApplyTelemetry(
            boot, 2, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow,
            null, null, null, null, NavigationStatus.IDLE, LocalizationStatus.LOST,
            0, 0, null, null, null));

        Assert.Equal(3, robot.PoseX);
        Assert.Equal(4, robot.PoseY);
        Assert.Equal(0.5, robot.PoseYaw);
        Assert.Equal(60m, robot.BatteryPercent);
        Assert.Equal(LocalizationStatus.LOST, robot.LocalizationStatus);
    }
}
