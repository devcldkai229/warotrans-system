using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.TeleopRobot;

/// <summary>
/// Manual drive: forwards one setpoint to the robot (MQTT teleop, QoS 0). Sequenced controllers keep only the
/// latest accepted sequence on the current lease. Motion requires an online, enabled, idle robot and a valid lease.
/// </summary>
public sealed class TeleopRobotHandler(
    FleetDbContext db,
    IMqttRobotTeleopPublisher publisher,
    WaroTrans.BuildingBlocks.Abstractions.ICurrentUser currentUser,
    TimeProvider timeProvider,
    IOptions<ManualDriveOptions> options)
{
    /// <summary>Backend cap, above any robot's own limit; the gateway clamps to the robot's real limits.</summary>
    public const double MaxLinear = 1.0;
    public const double MaxAngular = 2.0;
    internal static readonly TimeSpan MaxAge = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan FutureTolerance = TimeSpan.FromMilliseconds(250);

    public async Task<TeleopRobotResponse> HandleAsync(
        Guid robotId,
        TeleopRobotRequest request,
        CancellationToken cancellationToken)
    {
        var sequenced = request.LeaseId is not null || request.Seq is not null || request.ClientSentAt is not null;
        if (sequenced && !options.Value.EnableSequencedLease)
            throw new ConflictException("Sequenced manual drive is unavailable on this deployment.", "manual_sequence_unavailable");
        if (sequenced) ValidateTimestamp(request, timeProvider.GetUtcNow());

        await using var transaction = sequenced && db.Database.IsNpgsql()
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        if (transaction is not null)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT id FROM fleet.robots WHERE id = {robotId} FOR UPDATE", cancellationToken);
        var robot = await db.Robots.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        var (linear, angular) = Evaluate(robot, request);
        var now = timeProvider.GetUtcNow();
        var motion = linear != 0 || angular != 0;

        // Legacy zero setpoints remain available to any operator with permission and robot scope.
        if ((motion || sequenced) && (!robot.HasActiveManualLease(now) || robot.ManualLeaseHolderId != currentUser.AccountId))
        {
            throw new ConflictException(
                robot.HasActiveManualLease(now)
                    ? $"{robot.ManualLeaseHolderName} holds the manual-drive lease of {robot.Code}."
                    : $"Take the manual-drive lease of {robot.Code} first.",
                "manual_lease_required");
        }

        if (sequenced)
        {
            ValidateSequence(robot, request, now);
            robot.ManualLeaseLastSequence = request.Seq;
            await db.SaveChangesAsync(cancellationToken);
        }
        else if (motion && robot.ManualLeaseId is not null)
        {
            throw new ConflictException("Send the lease id, sequence and timestamp for this controller.", "manual_sequence_required");
        }

        now = timeProvider.GetUtcNow();
        if (sequenced) ValidateTimestamp(request, now);
        var message = new RobotTeleopMessage
        {
            RobotCode = robot.Code,
            Linear = linear,
            Angular = angular,
            Assist = request.Assist ?? true,
            SentAt = now,
            LeaseId = request.LeaseId,
            Seq = request.Seq,
            ClientSentAt = request.ClientSentAt
        };
        if (message.ClientSentAt is { } sent)
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var remaining = MaxAge - (now - sent);
            deadline.CancelAfter(remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero);
            try
            {
                await publisher.PublishAsync(message, deadline.Token);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested && deadline.IsCancellationRequested)
            {
                throw new ConflictException("This manual setpoint expired before it could be sent.", "manual_setpoint_stale");
            }
        }
        else
        {
            await publisher.PublishAsync(message, cancellationToken);
        }
        if (transaction is not null) await transaction.CommitAsync(CancellationToken.None);

        return new TeleopRobotResponse(robot.Id, robot.Code, linear, angular);
    }

    private static void ValidateSequence(Robot robot, TeleopRobotRequest request, DateTimeOffset now)
    {
        if (request.LeaseId != robot.ManualLeaseId)
            throw new ConflictException("This manual-drive lease has changed or expired.", "manual_lease_changed");
        if (request.Seq <= robot.ManualLeaseLastSequence)
            throw new ConflictException("A newer manual setpoint was already accepted.", "manual_sequence_out_of_order");
        ValidateTimestamp(request, now);
    }

    private static void ValidateTimestamp(TeleopRobotRequest request, DateTimeOffset now)
    {
        if (request.LeaseId is null || request.LeaseId == Guid.Empty || request.Seq is null or <= 0 || request.ClientSentAt is not { } sent)
            throw new DomainValidationException("Provide the lease id, positive sequence and timestamp.", "manual_sequence_required");
        if (now - sent > MaxAge || sent - now > FutureTolerance)
            throw new ConflictException("This manual setpoint is outside the allowed time window.", "manual_setpoint_stale");
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

        if (robot.MotionHeld)
        {
            throw new DomainValidationException("Robot holds motion after a STOP. Resume it first.", "robot_motion_held");
        }

        return (linear, angular);
    }
}
