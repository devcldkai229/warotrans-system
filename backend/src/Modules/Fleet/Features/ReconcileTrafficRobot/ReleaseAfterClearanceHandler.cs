using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Contracts;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.Dispatch;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Features.ReconcileTrafficRobot;

/// <param name="RobotCode">Typed by the operator, so a click cannot release the wrong robot.</param>
/// <param name="ClearanceConfirmed">The operator went and looked: the robot no longer stands in these zones.</param>
public sealed record ReleaseAfterClearanceRequest(string? RobotCode, bool ClearanceConfirmed, string? Reason);

/// <summary>
/// WEB-FLEET-06: frees every zone a robot holds, on a person's word. Whatever software can check is checked first:
/// a robot that can report where it is must go through reconcile, which uses its pose; one that still has a Job or a
/// running command is not finished. A silent robot cannot be checked, so this rests on the person, and the audit
/// trail says who.
/// </summary>
public sealed class ReleaseAfterClearanceHandler(
    FleetDbContext db,
    ISegmentedTrafficCoordinator coordinator,
    ICurrentUser currentUser,
    IAuditTrail audit,
    IOptions<BatteryOptions> freshness,
    TimeProvider clock,
    IRobotWorkQuery? work = null)
{
    public async Task<TrafficOpResult> HandleAsync(Guid robotId, ReleaseAfterClearanceRequest body, CancellationToken cancellationToken)
    {
        var actor = currentUser.AccountId
            ?? throw new AppException("An authenticated account is required.", 401, "unauthenticated");
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

        if (!body.ClearanceConfirmed)
        {
            throw new DomainValidationException("Confirm that you checked the robot is out of these zones.", "clearance_not_confirmed");
        }

        var reason = body.Reason?.Trim();
        if (string.IsNullOrEmpty(reason))
        {
            throw new DomainValidationException("Say what you checked.", "clearance_reason_required");
        }

        if (!string.Equals(body.RobotCode?.Trim(), robot.Code, StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainValidationException($"Type the robot code {robot.Code} to confirm.", "robot_code_mismatch");
        }

        var now = clock.GetUtcNow();
        if (robot.IsOnline
            && robot.LocalizationStatus == LocalizationStatus.LOCALIZED
            && robot.LastTelemetryAt is { } seen
            && (now - seen).TotalSeconds <= freshness.Value.StaleSeconds)
        {
            throw new ConflictException(
                $"Robot {robot.Code} is online and knows where it is. Reconcile it instead, which checks its pose.",
                "robot_can_report_pose");
        }

        if (work is not null && await work.HasActiveJobAsync(robotId, cancellationToken))
        {
            throw new ConflictException(
                $"Robot {robot.Code} still holds a Job. Finish its recovery or cancel the Job first.",
                "robot_has_active_job");
        }

        var running = await db.RobotCommands.AsNoTracking().AnyAsync(
            c => c.RobotId == robotId
                 && c.Type == RobotCommandType.NAVIGATE_TO_POSE
                 && (c.Status == RobotCommandStatus.SENT || c.Status == RobotCommandStatus.ACKED || c.Status == RobotCommandStatus.RUNNING),
            cancellationToken);
        if (running)
        {
            throw new ConflictException($"Robot {robot.Code} still has a navigation running.", "robot_has_active_command");
        }

        var snapshot = await coordinator.GetTrafficSnapshotAsync(cancellationToken).ConfigureAwait(false);
        var held = snapshot.Robots.FirstOrDefault(r => r.RobotId == robotId)?.OccupiedResourceIds ?? [];
        if (held.Length == 0)
        {
            throw new ConflictException($"Robot {robot.Code} holds no zone.", "nothing_to_release");
        }

        var result = await coordinator.ReleaseAfterPhysicalClearanceAsync(robotId, actor.ToString(), null, cancellationToken).ConfigureAwait(false);
        if (!result.Ok)
        {
            throw new ConflictException($"Traffic refused the release: {result.Reason}", "traffic_release_refused");
        }

        await audit.RecordAsync(
            new AuditEntry(
                "traffic.released_after_clearance",
                "ROBOT",
                robotId,
                Before: new Dictionary<string, object?> { ["occupiedResourceIds"] = held.ToArray(), ["isOnline"] = robot.IsOnline },
                Reason: reason),
            cancellationToken);
        return result;
    }
}
