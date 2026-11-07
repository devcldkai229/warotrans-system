using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.UnitTests.Fleet;

/// <summary>
/// A registered robot starts OFFLINE and heartbeats never change Status, so before PutInService nothing could make a
/// new robot dispatchable (DispatchRobotSelector only takes AVAILABLE robots).
/// </summary>
public class RobotPutInServiceTests
{
    private static Robot ConnectedRobot()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "Robot 01", DateTimeOffset.UtcNow);
        Assert.True(robot.TryApplyHeartbeat(Guid.NewGuid(), 1, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, out _));
        return robot;
    }

    [Fact]
    public void Heartbeat_alone_leaves_a_new_robot_undispatchable()
    {
        var robot = ConnectedRobot();

        Assert.True(robot.IsOnline);
        Assert.Equal(RobotStatus.OFFLINE, robot.Status);
    }

    [Fact]
    public void Connected_enabled_idle_robot_is_put_in_service()
    {
        var robot = ConnectedRobot();

        robot.PutInService(DateTimeOffset.UtcNow);

        Assert.Equal(RobotStatus.AVAILABLE, robot.Status);
    }

    [Fact]
    public void Disconnected_robot_cannot_be_put_in_service()
    {
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-001", "Robot 01", DateTimeOffset.UtcNow);

        var ex = Assert.Throws<DomainValidationException>(() => robot.PutInService(DateTimeOffset.UtcNow));
        Assert.Equal("robot_offline", ex.Code);
    }

    [Fact]
    public void Disabled_robot_cannot_be_put_in_service()
    {
        var robot = ConnectedRobot();
        robot.Disable();

        var ex = Assert.Throws<DomainValidationException>(() => robot.PutInService(DateTimeOffset.UtcNow));
        Assert.Equal("robot_disabled", ex.Code);
    }

    [Fact]
    public void Robot_already_in_service_is_refused()
    {
        var robot = ConnectedRobot();
        robot.PutInService(DateTimeOffset.UtcNow);

        var ex = Assert.Throws<ConflictException>(() => robot.PutInService(DateTimeOffset.UtcNow));
        Assert.Equal("robot_not_offline", ex.Code);
    }

    [Fact]
    public void Changing_map_needs_a_new_localization_and_is_refused_while_the_robot_has_a_command()
    {
        var robot = ConnectedRobot();
        robot.LocalizationStatus = LocalizationStatus.LOCALIZED;
        var newMap = Guid.NewGuid();

        robot.ChangeMap(newMap, DateTimeOffset.UtcNow);

        Assert.Equal(newMap, robot.CurrentMapVersionId);
        Assert.Equal(LocalizationStatus.UNKNOWN, robot.LocalizationStatus);

        robot.MarkExecuting(Guid.NewGuid(), DateTimeOffset.UtcNow);
        var ex = Assert.Throws<ConflictException>(() => robot.ChangeMap(Guid.NewGuid(), DateTimeOffset.UtcNow));
        Assert.Equal("robot_busy", ex.Code);
    }
}
