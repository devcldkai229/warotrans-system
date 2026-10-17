using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Features.TeleopRobot;

namespace WaroTrans.UnitTests.Fleet.Features.TeleopRobot;

/// <summary>Decision rules of manual drive (the DB + MQTT path is covered by TeleopRobotEndpointTests).</summary>
public sealed class TeleopRobotHandlerTests
{
    private static Robot CreateRobot(bool online = true, bool enabled = true, bool busy = false)
    {
        var now = DateTimeOffset.UtcNow;
        var robot = Robot.Register(Guid.NewGuid(), Guid.NewGuid(), "RBT-SIM-01", "Sim", now);
        if (online)
        {
            robot.TryApplyHeartbeat(Guid.NewGuid(), 1, now, now, out _);
        }

        if (!enabled)
        {
            robot.Disable();
        }

        if (busy)
        {
            robot.ReserveForCommand(Guid.NewGuid(), now);
        }

        return robot;
    }

    [Fact]
    public void Passes_setpoint_through_for_a_free_online_robot()
    {
        var (linear, angular) = TeleopRobotHandler.Evaluate(CreateRobot(), new TeleopRobotRequest(0.2, -0.5));
        Assert.Equal(0.2, linear);
        Assert.Equal(-0.5, angular);
    }

    [Fact]
    public void Caps_speeds_at_backend_limit()
    {
        var (linear, angular) = TeleopRobotHandler.Evaluate(CreateRobot(), new TeleopRobotRequest(9, -9));
        Assert.Equal(TeleopRobotHandler.MaxLinear, linear);
        Assert.Equal(-TeleopRobotHandler.MaxAngular, angular);
    }

    [Theory]
    [InlineData(false, true, false, "robot_offline")]
    [InlineData(true, false, false, "robot_disabled")]
    [InlineData(true, true, true, "robot_busy")]
    public void Refuses_motion_when_robot_cannot_be_driven(bool online, bool enabled, bool busy, string code)
    {
        var ex = Assert.Throws<DomainValidationException>(() =>
            TeleopRobotHandler.Evaluate(CreateRobot(online, enabled, busy), new TeleopRobotRequest(0.2, 0)));
        Assert.Equal(code, ex.Code);
    }

    [Fact]
    public void Stop_is_always_allowed_even_when_busy_offline_or_disabled()
    {
        var robot = CreateRobot(online: false, enabled: false, busy: true);
        Assert.Equal((0d, 0d), TeleopRobotHandler.Evaluate(robot, new TeleopRobotRequest(0, 0)));
    }

    [Theory]
    [InlineData(double.NaN, 0)]
    [InlineData(0, double.PositiveInfinity)]
    public void Validator_rejects_non_finite_values(double linear, double angular)
    {
        var result = new TeleopRobotRequestValidator().Validate(new TeleopRobotRequest(linear, angular));
        Assert.False(result.IsValid);
    }
}
