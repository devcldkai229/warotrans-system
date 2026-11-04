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
                if (options.Value.Mode is not (TrafficCoordinatorMode.Active or TrafficCoordinatorMode.Semantic))
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

        var hasEdges = !evt.Authority.EdgeIds.IsDefaultOrEmpty && evt.Authority.EdgeIds.Length > 0;
        var hasSemantic = evt.Authority.PlanRevision > 0
            || (!evt.Authority.ResourceIds.IsDefaultOrEmpty && evt.Authority.ResourceIds.Length > 0);
        if (!hasEdges && !hasSemantic)
        {
            logger.LogWarning(
                "Skip Active publish for empty segment robot={RobotCode} auth={AuthorityId} (already at safe-stop)",
                robot.Code, evt.Authority.AuthorityId);
            return;
        }

        var expiresAt = evt.ExpiresAt ?? DateTimeOffset.UtcNow.Add(AuthorityTtl);
        var pathHash = hasEdges
            ? AuthorityPathHash.Compute(evt.Authority.GraphHash, evt.Authority.EdgeIds)
            : AuthorityPathHash.Compute(
                evt.Authority.SemanticMapFingerprint ?? evt.Authority.GraphHash,
                evt.Authority.ResourceIds);
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
            SemanticMapFingerprint = evt.Authority.SemanticMapFingerprint ?? evt.Authority.GraphHash,
            PlanRevision = evt.Authority.PlanRevision,
            ResourceIds = evt.Authority.ResourceIds.IsDefaultOrEmpty
                ? []
                : evt.Authority.ResourceIds.ToList(),
            SegmentEdgeIds = evt.Authority.EdgeIds.IsDefaultOrEmpty
                ? []
                : evt.Authority.EdgeIds.ToList(),
            PathHash = pathHash,
            GoalSafeStopNodeId = evt.Authority.GoalSafeStopNodeId == 0
                ? null
                : evt.Authority.GoalSafeStopNodeId,
            ExpiresAt = expiresAt,
            FinalGoal = finalGoal,
            Maneuvers = evt.Authority.Maneuvers.IsDefaultOrEmpty
                ? null
                : ManeuverStepBuilder.ToPayload(evt.Authority.Maneuvers)
        };

        if (evt.Kind == TrafficEventKind.AuthorityGranted && evt.IsFirstSegment)
        {
            // Stage-3 Semantic: NAVIGATE already issued by JobExecutionEngine; attach authority via EXTEND path.
            if (evt.Authority.PlanRevision > 0)
            {
                if (!_activeCommandByRobot.TryGetValue(evt.RobotId, out var semanticTarget))
                {
                    semanticTarget = await db.RobotCommands.AsNoTracking()
                        .Where(c => c.RobotId == evt.RobotId
                                    && c.Type == RobotCommandType.NAVIGATE_TO_POSE
                                    && (c.Status == RobotCommandStatus.SENT
                                        || c.Status == RobotCommandStatus.ACKED
                                        || c.Status == RobotCommandStatus.RUNNING))
                        .OrderByDescending(c => c.IssuedAt)
                        .Select(c => c.Id)
                        .FirstOrDefaultAsync(ct)
                        .ConfigureAwait(false);
                    if (semanticTarget != Guid.Empty)
                    {
                        _activeCommandByRobot[evt.RobotId] = semanticTarget;
                    }
                }

                if (semanticTarget == Guid.Empty)
                {
                    // Standalone NavigateToPose (sim Stage-3): robot proposes via MQTT traffic_plan
                    // without a Fleet NAVIGATE_TO_POSE row. Still publish EXTEND so the gate opens.
                    semanticTarget = evt.Authority.AuthorityId;
                    _activeCommandByRobot[evt.RobotId] = semanticTarget;
                    logger.LogInformation(
                        "Semantic standalone EXTEND (no NAVIGATE command) robot={RobotCode} rev={Rev} target={Target}",
                        robot.Code, evt.Authority.PlanRevision, semanticTarget);
                }

                // Fall through to EXTEND_AUTHORITY below by treating as non-first publish.
            }
            else
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
                SegmentEdgeIds = evt.Authority.EdgeIds.IsDefaultOrEmpty
                    ? []
                    : evt.Authority.EdgeIds.ToList(),
                PathHash = pathHash,
                GraphHash = evt.Authority.GraphHash,
                SemanticMapFingerprint = evt.Authority.SemanticMapFingerprint ?? evt.Authority.GraphHash,
                PlanRevision = evt.Authority.PlanRevision,
                ResourceIds = evt.Authority.ResourceIds.IsDefaultOrEmpty
                    ? []
                    : evt.Authority.ResourceIds.ToList(),
                ExpiresAt = expiresAt,
                FinalGoal = finalGoal,
                Maneuvers = evt.Authority.Maneuvers.IsDefaultOrEmpty
                    ? null
                    : ManeuverStepBuilder.ToPayload(evt.Authority.Maneuvers)
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
