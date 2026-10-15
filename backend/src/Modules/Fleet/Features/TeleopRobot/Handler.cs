using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.TeleopRobot;

/// <summary>
/// Manual drive: forwards one setpoint to the robot (MQTT teleop, QoS 0). Nothing is persisted — it is called
/// ~5 times a second while a button is held. A stop (<c>{0, 0}</c>) is always forwarded; a motion is refused
/// while the robot is disabled, offline or busy with a navigate command (it would fight Nav2 on /cmd_vel).
/// </summary>
public sealed class TeleopRobotHandler(
    FleetDbContext db,
    IMqttRobotTeleopPublisher publisher,
    TimeProvider timeProvider)
{
    /// <summary>Backend cap, above any robot's own limit; the gateway clamps to the robot's real limits.</summary>
    public const double MaxLinear = 1.0;
    public const double MaxAngular = 2.0;

    public async Task<TeleopRobotResponse> HandleAsync(
        Guid robotId,
        TeleopRobotRequest request,
        CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        var (linear, angular) = Evaluate(robot, request);

        await publisher.PublishAsync(
            new RobotTeleopMessage
            {
                RobotCode = robot.Code,
                Linear = linear,
                Angular = angular,
                Assist = request.Assist ?? true,
                SentAt = timeProvider.GetUtcNow()
            },
            cancellationToken);

        return new TeleopRobotResponse(robot.Id, robot.Code, linear, angular);
    }

    /// <summary>Capped setpoint to send, or a domain error when the robot must not be driven right now.</summary>
    public static (double Linear, double Angular) Evaluate(Robot robot, TeleopRobotRequest request)
    {
        var linear = Math.Clamp(request.Linear, -MaxLinear, MaxLinear);
        var angular = Math.Clamp(request.Angular, -MaxAngular, MaxAngular);
        if (linear == 0 && angular == 0)
        {
            return (0, 0); // a stop always goes through
        }

        if (!robot.IsEnabled)
        {
            throw new DomainValidationException("Robot is disabled.", "robot_disabled");
        }

        if (!robot.IsOnline)
        {
            throw new DomainValidationException("Robot is offline.", "robot_offline");
        }

        if (robot.CurrentCommandId is not null)
        {
            throw new DomainValidationException(
                "Robot is executing a navigate command. Cancel it before driving manually.",
                "robot_busy");
        }

        return (linear, angular);
    }
}
