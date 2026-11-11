using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.IssueCancelCommand;
using WaroTrans.Fleet.Features.IssueNavigateCommand;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Features.Positioning;

/// <summary>
/// FL-08 auto return-to-park as a Fleet positioning intent (not a Job, not a Transport Request).
/// <list type="number">
/// <item>Start: claim the robot and the parking Endpoint in the database (unique while live), then send a plain NAVIGATE.</item>
/// <item>Yield: a Job got the robot. CANCEL the NAVIGATE, wait for it to end (RESULT, CANCEL result, timeout or offline
/// abort), then reconcile traffic from the robot's own fresh, localized pose. Only then may the Job's MOVE go out:
/// a cancelled NAVIGATE quarantines the robot in traffic, and only a reconcile with the robot idle lifts that.</item>
/// <item>Settle: intents whose NAVIGATE ended without a Job are closed (ARRIVED / FAILED).</item>
/// </list>
/// The intent follows the RobotCommand, which is the one place every way a command can end is recorded; a late MQTT
/// result of an ended NAVIGATE is already dropped by RobotCommand.TryApplyResult and changes nothing here.
/// </summary>
public sealed class RobotPositioningService(
    FleetDbContext db,
    IssueNavigateCommandHandler navigate,
    IssueCancelCommandHandler cancel,
    TimeProvider clock,
    ILogger<RobotPositioningService> logger,
    IOptions<TrafficOptions>? trafficOptions = null,
    ISegmentedTrafficCoordinator? segmentedTraffic = null)
{
    /// <summary>A CANCEL that got no answer is sent again after this long (the robot may have missed it).</summary>
    public static readonly TimeSpan CancelResendAfter = TimeSpan.FromSeconds(5);

    /// <summary>A claim whose NAVIGATE never went out (the host stopped in between) is given up after this long.</summary>
    public static readonly TimeSpan UnsentClaimTimeout = TimeSpan.FromSeconds(30);

    public async Task<IReadOnlySet<Guid>> LiveRobotIdsAsync(CancellationToken cancellationToken) =>
        (await db.RobotPositioningIntents.AsNoTracking()
            .Where(i => i.Status == PositioningIntentStatus.NAVIGATING || i.Status == PositioningIntentStatus.YIELDING)
            .Select(i => i.RobotId)
            .ToListAsync(cancellationToken)).ToHashSet();

    public async Task<IReadOnlySet<Guid>> LiveTargetsAsync(Guid mapVersionId, CancellationToken cancellationToken) =>
        (await db.RobotPositioningIntents.AsNoTracking()
            .Where(i => i.MapVersionId == mapVersionId
                        && (i.Status == PositioningIntentStatus.NAVIGATING || i.Status == PositioningIntentStatus.YIELDING))
            .Select(i => i.TargetEndpointId)
            .ToListAsync(cancellationToken)).ToHashSet();

    /// <summary>Claims robot + Endpoint, then sends the NAVIGATE. Throws (with a code) when either is taken or the robot refuses.</summary>
    public async Task<Guid> StartReturnToParkAsync(
        Guid robotId,
        Guid endpointId,
        double x,
        double y,
        double yaw,
        CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
        var now = clock.GetUtcNow();
        var intent = new RobotPositioningIntent
        {
            Id = Guid.NewGuid(),
            RobotId = robotId,
            MapVersionId = robot.CurrentMapVersionId,
            Kind = PositioningIntentKind.RETURN_TO_PARK,
            TargetEndpointId = endpointId,
            Status = PositioningIntentStatus.NAVIGATING,
            CreatedAt = now,
            UpdatedAt = now
        };
        db.RobotPositioningIntents.Add(intent);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            db.ChangeTracker.Clear();
            throw new ConflictException(
                $"Robot {robot.Code} already has a positioning intent, or another robot is heading for that parking place.",
                "positioning_conflict");
        }

        try
        {
            var sent = await navigate.HandleAsync(
                robotId,
                new IssueNavigateCommandRequest(x, y, yaw, "map", JobId: null, JobAssignmentId: null, JobStepId: null),
                cancellationToken);
            await UpdateAsync(intent.Id, i =>
            {
                i.NavigateCommandId = sent.CommandId;
                i.UpdatedAt = clock.GetUtcNow();
            }, cancellationToken);
        }
        catch (AppException refused)
        {
            db.ChangeTracker.Clear();
            await UpdateAsync(intent.Id, i => i.End(PositioningIntentStatus.FAILED, $"navigate_refused:{refused.Code}", clock.GetUtcNow()), cancellationToken);
            throw;
        }

        logger.LogInformation("Robot {RobotCode} returns to park at endpoint {EndpointId} (intent {IntentId})", robot.Code, endpointId, intent.Id);
        return intent.Id;
    }

    /// <summary>
    /// Called by the Job that took the robot, as often as it likes: sends the CANCEL once (again after
    /// <see cref="CancelResendAfter"/>), and says Ready only when the NAVIGATE ended and traffic was reconciled.
    /// </summary>
    public async Task<PositioningYield> YieldAsync(Guid robotId, Guid jobId, CancellationToken cancellationToken)
    {
        var intent = await db.RobotPositioningIntents
            .FirstOrDefaultAsync(i => i.RobotId == robotId
                                      && (i.Status == PositioningIntentStatus.NAVIGATING || i.Status == PositioningIntentStatus.YIELDING),
                cancellationToken);
        if (intent is null)
        {
            return PositioningYield.Ready;
        }

        var now = clock.GetUtcNow();
        intent.YieldToJobId ??= jobId;
        if (intent.NavigateCommandId is not { } commandId)
        {
            // Claimed, NAVIGATE not out yet: it is either about to go (then it is cancelled next time) or never will.
            if (now - intent.CreatedAt > UnsentClaimTimeout)
            {
                intent.End(PositioningIntentStatus.FAILED, "navigate_never_sent", now);
                await db.SaveChangesAsync(cancellationToken);
                return PositioningYield.Ready;
            }

            await db.SaveChangesAsync(cancellationToken);
            return PositioningYield.Waiting("positioning_navigate_pending");
        }

        var command = await db.RobotCommands.AsNoTracking().FirstOrDefaultAsync(c => c.Id == commandId, cancellationToken);
        if (command is { IsInFlight: true })
        {
            if (intent.Status == PositioningIntentStatus.NAVIGATING
                || intent.CancelRequestedAt is not { } asked || now - asked >= CancelResendAfter)
            {
                intent.Status = PositioningIntentStatus.YIELDING;
                intent.CancelRequestedAt = now;
                intent.UpdatedAt = now;
                await db.SaveChangesAsync(cancellationToken);
                try
                {
                    await cancel.HandleAsync(robotId, new IssueCancelCommandRequest(commandId), cancellationToken);
                    logger.LogInformation("Robot {RobotId} stops returning to park for Job {JobId}: CANCEL {CommandId}", robotId, jobId, commandId);
                }
                catch (AppException notSent)
                {
                    // Offline or the command just ended: the next call sees which.
                    db.ChangeTracker.Clear();
                    logger.LogWarning("CANCEL of park NAVIGATE {CommandId} not sent: {Code}", commandId, notSent.Code);
                }
            }

            return PositioningYield.Waiting("positioning_cancel_pending");
        }

        // NAVIGATE ended (by our CANCEL, or it arrived / failed / was aborted first). Traffic next.
        intent.Status = PositioningIntentStatus.YIELDING;
        intent.UpdatedAt = now;
        var reconcile = await ReconcileTrafficAsync(robotId, cancellationToken);
        if (reconcile is not null)
        {
            await db.SaveChangesAsync(cancellationToken);
            return PositioningYield.Waiting(reconcile);
        }

        intent.End(PositioningIntentStatus.YIELDED, $"yielded_to_job:{jobId:N}:{command?.Outcome ?? "UNKNOWN"}", now);
        await db.SaveChangesAsync(cancellationToken);
        return PositioningYield.Ready;
    }

    /// <summary>Closes intents whose NAVIGATE ended while no Job wanted the robot. Returns how many were closed.</summary>
    public async Task<int> SettleAsync(CancellationToken cancellationToken)
    {
        var live = await db.RobotPositioningIntents
            .Where(i => i.Status == PositioningIntentStatus.NAVIGATING)
            .ToListAsync(cancellationToken);
        if (live.Count == 0)
        {
            return 0;
        }

        var commandIds = live.Where(i => i.NavigateCommandId is not null).Select(i => i.NavigateCommandId!.Value).ToList();
        var commands = await db.RobotCommands.AsNoTracking()
            .Where(c => commandIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, cancellationToken);
        var now = clock.GetUtcNow();
        var closed = 0;
        foreach (var intent in live)
        {
            if (intent.NavigateCommandId is not { } id)
            {
                if (now - intent.CreatedAt > UnsentClaimTimeout)
                {
                    intent.End(PositioningIntentStatus.FAILED, "navigate_never_sent", now);
                    closed++;
                }

                continue;
            }

            if (!commands.TryGetValue(id, out var command) || command.IsInFlight)
            {
                continue;
            }

            if (command.Outcome == RobotCommandOutcomes.Succeeded)
            {
                intent.End(PositioningIntentStatus.ARRIVED, "arrived", now);
            }
            else
            {
                intent.End(PositioningIntentStatus.FAILED, $"{command.Status}:{command.ErrorCode ?? command.RejectReasonCode ?? command.Outcome ?? "unknown"}", now);
            }

            closed++;
        }

        await db.SaveChangesAsync(cancellationToken);
        return closed;
    }

    /// <summary>Null when traffic may hand the robot on; otherwise why not yet.</summary>
    private async Task<string?> ReconcileTrafficAsync(Guid robotId, CancellationToken cancellationToken)
    {
        if (segmentedTraffic is null
            || trafficOptions?.Value.Mode is not (TrafficCoordinatorMode.Active or TrafficCoordinatorMode.Semantic))
        {
            return null; // Shadow / off: no reservations to rebuild.
        }

        var robot = await db.Robots.AsNoTracking().FirstAsync(r => r.Id == robotId, cancellationToken);
        if (robot.CurrentCommandId is not null)
        {
            return "positioning_robot_still_reserved";
        }

        var maxAge = TimeSpan.FromSeconds(Math.Max(0.5, trafficOptions.Value.PoseMaxAgeSec));
        if (robot.LocalizationStatus != LocalizationStatus.LOCALIZED
            || robot.LastTelemetryAt is not { } at
            || clock.GetUtcNow() - at > maxAge)
        {
            return "positioning_pose_unverified";
        }

        var result = await segmentedTraffic.ReconcileRobotAsync(
            robotId, robot.PoseX, robot.PoseY, true, [], robotReportsIdle: true, ct: cancellationToken);
        // NO_GRAPH: no graph / semantic policy is bound, so nothing is reserved anywhere and there is nothing to rebuild.
        return result.Ok || result.Reason == "NO_GRAPH" ? null : $"positioning_traffic_reconcile:{result.Reason}";
    }

    private async Task UpdateAsync(Guid intentId, Action<RobotPositioningIntent> change, CancellationToken cancellationToken)
    {
        var intent = await db.RobotPositioningIntents.FirstAsync(i => i.Id == intentId, cancellationToken);
        change(intent);
        await db.SaveChangesAsync(cancellationToken);
    }
}
