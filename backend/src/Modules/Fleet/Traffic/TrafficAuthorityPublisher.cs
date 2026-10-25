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
    private readonly TimeSpan _authorityTtl = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
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

        var expiresAt = evt.ExpiresAt ?? DateTimeOffset.UtcNow.Add(_authorityTtl);
        var pathHash = AuthorityPathHash.Compute(evt.Authority.GraphHash, evt.Authority.EdgeIds);
        var authorityPayload = new AuthorityPayload
        {
            AuthorityId = evt.Authority.AuthorityId,
            Epoch = evt.Authority.Epoch,
            Seq = evt.Authority.Seq,
            GraphHash = evt.Authority.GraphHash,
            SegmentEdgeIds = evt.Authority.EdgeIds.ToList(),
            PathHash = pathHash,
            GoalSafeStopNodeId = evt.Authority.GoalSafeStopNodeId,
            ExpiresAt = expiresAt,
            FinalGoal = evt.GoalX is double gx && evt.GoalY is double gy
                ? new Pose2DPayload { X = gx, Y = gy, Yaw = evt.GoalYaw ?? 0 }
                : null
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
                ExpiresAt = expiresAt
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

            await commandPublisher.PublishAsync(new RobotCommandMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                CommandId = commandId,
                RobotCode = robot.Code,
                Type = RobotCommandTypes.ExtendAuthority,
                IssuedAt = utcNow,
                JobStepId = evt.JobStepId,
                Payload = JsonSerializer.SerializeToElement(extendPayload, JsonOptions)
            }, ct).ConfigureAwait(false);

            logger.LogInformation(
                "Active EXTEND_AUTHORITY robot={RobotCode} target={Target} seq={Seq}",
                robot.Code, targetCommandId, evt.Authority.Seq);
        }
    }
}
