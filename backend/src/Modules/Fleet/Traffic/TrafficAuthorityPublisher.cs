using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.IssueNavigateCommand;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Services;

namespace WaroTrans.Fleet.Traffic;

/// <summary>
/// Active Mode only: consumes coordinator outbox and publishes NAVIGATE+authority or EXTEND_AUTHORITY.
/// Shadow Mode: no-op consumer (events may still be dropped).
/// </summary>
public sealed class TrafficAuthorityPublisher(
    TrafficEventOutbox outbox,
    IOptions<TrafficOptions> options,
    IServiceScopeFactory scopeFactory,
    IMqttRobotCommandPublisher commandPublisher,
    ILogger<TrafficAuthorityPublisher> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly Dictionary<Guid, Guid> _activeCommandByRobot = new();

    private TimeSpan AuthorityTtl =>
        TimeSpan.FromSeconds(Math.Max(5, options.Value.AuthorityTtlSec));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Host bind failure / Ctrl+C cancels stoppingToken; ReadAllAsync throws OCE from MoveNext
        // (outside the per-event try). Swallow it so BackgroundServiceExceptionBehavior=StopHost
        // does not turn a normal shutdown into a process crash.
        try
        {
            await foreach (var evt in outbox.ReadAllAsync(stoppingToken).ConfigureAwait(false))
            {
                if (options.Value.Mode != TrafficCoordinatorMode.Active)
                {
                    continue;
                }

                try
                {
                    await HandleAsync(evt, stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "TrafficAuthorityPublisher failed for robot {RobotId}", evt.RobotId);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task HandleAsync(TrafficEvent evt, CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == evt.RobotId, ct)
            .ConfigureAwait(false);
        if (robot is null)
        {
            logger.LogWarning("Authority event for unknown robot {RobotId}", evt.RobotId);
            return;
        }

        if (evt.Kind == TrafficEventKind.AuthorityRevoked
            && _activeCommandByRobot.Remove(evt.RobotId, out var revokeTarget))
        {
            await PublishRevokeAsync(db, robot.Code, evt, revokeTarget, ct).ConfigureAwait(false);
            return;
        }

        if (evt.Kind is TrafficEventKind.AuthorityRevoked or TrafficEventKind.Quarantined
            or TrafficEventKind.AuthorityReleased)
        {
            _activeCommandByRobot.Remove(evt.RobotId);
            return;
        }

        if (evt.Authority.EdgeIds.IsDefaultOrEmpty || evt.Authority.EdgeIds.Length == 0)
        {
            logger.LogWarning(
                "Skip Active publish for empty segment robot={RobotCode} auth={AuthorityId} (already at safe-stop)",
                robot.Code, evt.Authority.AuthorityId);
            return;
        }

        var expiresAt = evt.ExpiresAt ?? DateTimeOffset.UtcNow.Add(AuthorityTtl);
        var pathHash = AuthorityPathHash.Compute(evt.Authority.GraphHash, evt.Authority.EdgeIds);
        // Only the segment that reaches the destination carries finalGoal: the robot completes NAVIGATE there
        // and otherwise stops at the safe stop awaiting EXTEND.
        var finalGoal = evt.IsFinalSegment && evt.GoalX is double gx && evt.GoalY is double gy
            ? new Pose2DPayload { X = gx, Y = gy, Yaw = evt.GoalYaw ?? 0 }
            : null;
        var authorityPayload = new AuthorityPayload
        {
            AuthorityId = evt.Authority.AuthorityId,
            Epoch = evt.Authority.Epoch,
            Seq = evt.Authority.Seq,
            MapVersionId = robot.CurrentMapVersionId,
            MapVersionCode = robot.MapVersionCode,
            GraphHash = evt.Authority.GraphHash,
            SegmentEdgeIds = evt.Authority.EdgeIds.ToList(),
            PathHash = pathHash,
            GoalSafeStopNodeId = evt.Authority.GoalSafeStopNodeId,
            ExpiresAt = expiresAt,
            FinalGoal = finalGoal
        };

        if (evt.Kind == TrafficEventKind.AuthorityGranted && evt.IsFirstSegment)
        {
            var navigate = scope.ServiceProvider.GetRequiredService<IssueNavigateCommandHandler>();
            var response = await navigate.HandleAsync(
                evt.RobotId,
                new IssueNavigateCommandRequest(
                    evt.GoalX ?? 0,
                    evt.GoalY ?? 0,
                    evt.GoalYaw ?? 0,
                    "map",
                    evt.JobId,
                    null,
                    evt.JobStepId,
                    new RouteGrantPayload
                    {
                        GraphHash = evt.Authority.GraphHash,
                        EdgeIds = evt.Authority.EdgeIds.ToList()
                    },
                    authorityPayload),
                ct).ConfigureAwait(false);
            _activeCommandByRobot[evt.RobotId] = response.CommandId;
            logger.LogInformation(
                "Active NAVIGATE+authority robot={RobotCode} command={CommandId} seq={Seq} edges={Count}",
                robot.Code, response.CommandId, evt.Authority.Seq, evt.Authority.EdgeIds.Length);
            return;
        }

        if (evt.Kind == TrafficEventKind.AuthorityRenewed)
        {
            if (!_activeCommandByRobot.TryGetValue(evt.RobotId, out var renewTarget))
            {
                logger.LogWarning("RENEW without active command for robot {RobotCode}", robot.Code);
                return;
            }

            var utcNow = DateTimeOffset.UtcNow;
            var renewCommandId = Guid.NewGuid();
            var renewPayload = new RenewAuthorityPayload
            {
                TargetCommandId = renewTarget,
                AuthorityId = evt.Authority.AuthorityId,
                Epoch = evt.Authority.Epoch,
                Seq = evt.Authority.Seq,
                ExpiresAt = expiresAt
            };
            db.RobotCommands.Add(new RobotCommand
            {
                Id = renewCommandId,
                RobotId = evt.RobotId,
                Type = RobotCommandType.RENEW_AUTHORITY,
                Status = RobotCommandStatus.SENT,
                PayloadJson = JsonSerializer.Serialize(renewPayload, JsonOptions),
                IssuedAt = utcNow,
                JobStepId = evt.JobStepId
            });
            await db.SaveChangesAsync(ct).ConfigureAwait(false);

            await db.PublishAndStampAsync(commandPublisher, new RobotCommandMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                CommandId = renewCommandId,
                RobotCode = robot.Code,
                Type = RobotCommandTypes.RenewAuthority,
                IssuedAt = utcNow,
                JobStepId = evt.JobStepId,
                Payload = JsonSerializer.SerializeToElement(renewPayload, JsonOptions)
            }, evt.RobotId, releasesRobot: false, ct).ConfigureAwait(false);

            logger.LogDebug(
                "Active RENEW_AUTHORITY robot={RobotCode} target={Target} seq={Seq}",
                robot.Code, renewTarget, evt.Authority.Seq);
            return;
        }

        if (evt.Kind is TrafficEventKind.AuthorityExtended or TrafficEventKind.AuthorityGranted)
        {
            if (!_activeCommandByRobot.TryGetValue(evt.RobotId, out var targetCommandId))
            {
                logger.LogWarning("EXTEND without active command for robot {RobotCode}", robot.Code);
                return;
            }

            var utcNow = DateTimeOffset.UtcNow;
            var commandId = Guid.NewGuid();
            var extendPayload = new ExtendAuthorityPayload
            {
                TargetCommandId = targetCommandId,
                AuthorityId = evt.Authority.AuthorityId,
                Epoch = evt.Authority.Epoch,
                Seq = evt.Authority.Seq,
                SegmentEdgeIds = evt.Authority.EdgeIds.ToList(),
                PathHash = pathHash,
                GraphHash = evt.Authority.GraphHash,
                ExpiresAt = expiresAt,
                FinalGoal = finalGoal
            };
            var command = new RobotCommand
            {
                Id = commandId,
                RobotId = evt.RobotId,
                Type = RobotCommandType.EXTEND_AUTHORITY,
                Status = RobotCommandStatus.SENT,
                PayloadJson = JsonSerializer.Serialize(extendPayload, JsonOptions),
                IssuedAt = utcNow,
                JobStepId = evt.JobStepId
            };
            db.RobotCommands.Add(command);
            await db.SaveChangesAsync(ct).ConfigureAwait(false);

            await db.PublishAndStampAsync(commandPublisher, new RobotCommandMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                CommandId = commandId,
                RobotCode = robot.Code,
                Type = RobotCommandTypes.ExtendAuthority,
                IssuedAt = utcNow,
                JobStepId = evt.JobStepId,
                Payload = JsonSerializer.SerializeToElement(extendPayload, JsonOptions)
            }, evt.RobotId, releasesRobot: false, ct).ConfigureAwait(false);

            logger.LogInformation(
                "Active EXTEND_AUTHORITY robot={RobotCode} target={Target} seq={Seq} final={Final}",
                robot.Code, targetCommandId, evt.Authority.Seq, evt.IsFinalSegment);
        }
    }

    /// <summary>Quarantine revoked the authority: stop the robot now through the traffic channel.</summary>
    private async Task PublishRevokeAsync(
        FleetDbContext db, string robotCode, TrafficEvent evt, Guid targetCommandId, CancellationToken ct)
    {
        var utcNow = DateTimeOffset.UtcNow;
        var commandId = Guid.NewGuid();
        var payload = new RevokeAuthorityPayload
        {
            TargetCommandId = targetCommandId,
            AuthorityId = evt.Authority.AuthorityId,
            Epoch = evt.Authority.Epoch,
            Seq = evt.Authority.Seq,
            Mode = "STOP_NOW"
        };
        db.RobotCommands.Add(new RobotCommand
        {
            Id = commandId,
            RobotId = evt.RobotId,
            Type = RobotCommandType.REVOKE_AUTHORITY,
            Status = RobotCommandStatus.SENT,
            PayloadJson = JsonSerializer.Serialize(payload, JsonOptions),
            IssuedAt = utcNow,
            JobStepId = evt.JobStepId
        });
        await db.SaveChangesAsync(ct).ConfigureAwait(false);

        await db.PublishAndStampAsync(commandPublisher, new RobotCommandMessage
        {
            SchemaVersion = 1,
            MessageId = Guid.NewGuid(),
            CommandId = commandId,
            RobotCode = robotCode,
            Type = RobotCommandTypes.RevokeAuthority,
            IssuedAt = utcNow,
            JobStepId = evt.JobStepId,
            Payload = JsonSerializer.SerializeToElement(payload, JsonOptions)
        }, evt.RobotId, releasesRobot: false, ct).ConfigureAwait(false);

        logger.LogWarning(
            "Active REVOKE_AUTHORITY robot={RobotCode} target={Target} auth={AuthorityId}",
            robotCode, targetCommandId, evt.Authority.AuthorityId);
    }
}
