using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.IntegrationEvents;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Services;

namespace WaroTrans.Fleet.Features.RobotControl;

/// <summary>REQUESTED → ACCEPTED → STOPPED_VERIFIED, or REJECTED / UNKNOWN. Never "stopped" without the robot saying so.</summary>
public static class StopStates
{
    public const string None = "NONE";
    public const string Requested = "REQUESTED";
    public const string Accepted = "ACCEPTED";
    public const string StoppedVerified = "STOPPED_VERIFIED";
    public const string Rejected = "REJECTED";
    public const string Unknown = "UNKNOWN";
}

public sealed record StopStateResponse(
    Guid RobotId,
    string State,
    bool MotionHeld,
    Guid? CommandId,
    string? Mode,
    string? CommandStatus,
    string? Outcome,
    string? ErrorCode,
    DateTimeOffset? IssuedAt,
    DateTimeOffset? CompletedAt);

public sealed record ManualLeaseResponse(
    Guid RobotId,
    bool Active,
    Guid? HolderId,
    string? HolderName,
    DateTimeOffset? Until,
    bool HeldByMe);

public sealed record MaintenanceChecklist(
    bool SensorsOk,
    bool LocalizationOk,
    bool StopTestOk,
    bool TrafficClear,
    string? Notes);

public sealed record MaintenanceRecordResponse(
    Guid Id,
    string Reason,
    string? StartedByName,
    DateTimeOffset StartedAt,
    string? CompletedByName,
    DateTimeOffset? CompletedAt,
    string? ChecklistJson,
    string? Notes);

/// <summary>
/// Robot-level control outside of jobs: STOP / PAUSE / RESUME (RB-03), the exclusive manual-drive lease (RB-04),
/// maintenance sessions (RB-08) and system actions (RB-09).
/// </summary>
public sealed class RobotControlService(
    FleetDbContext db,
    IMqttRobotCommandPublisher publisher,
    IIntegrationEventPublisher events,
    ICurrentUser currentUser,
    IHttpContextAccessor httpContextAccessor,
    IAuditTrail audit,
    TimeProvider clock,
    WaroTrans.Navigation.Contracts.INavigationModule? navigation = null)
{
    /// <summary>A lease is renewed by the client while the operator keeps driving; it lapses on its own otherwise.</summary>
    public static readonly TimeSpan LeaseDuration = TimeSpan.FromSeconds(30);

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    // ------------------------------------------------------------------ STOP / PAUSE / RESUME (RB-03)

    public async Task<StopStateResponse> StopAsync(Guid robotId, string mode, string? reason, CancellationToken cancellationToken)
    {
        var robot = await LoadAsync(robotId, cancellationToken);
        if (!robot.IsOnline)
        {
            throw new ConflictException(
                $"Robot {robot.Code} is offline: the stop cannot be delivered. Its state is UNKNOWN; use the physical E-stop.",
                "robot_offline");
        }

        var payload = new StopCommandPayload { Mode = mode, Reason = Trim(reason, 200) };
        await SendAsync(robot, RobotCommandType.STOP, RobotCommandTypes.Stop, payload, cancellationToken);
        return await GetStopStateAsync(robotId, cancellationToken);
    }

    public async Task<StopStateResponse> ResumeAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var robot = await LoadAsync(robotId, cancellationToken);
        if (!robot.IsOnline)
        {
            throw new ConflictException($"Robot {robot.Code} is offline.", "robot_offline");
        }

        await SendAsync(robot, RobotCommandType.RESUME, RobotCommandTypes.Resume, new { }, cancellationToken);

        // Optimistic: the robot answers within one telemetry period; a refused RESUME sets it back to held.
        await db.Robots.Where(r => r.Id == robotId).ExecuteUpdateAsync(
            s => s.SetProperty(r => r.MotionHeld, false).SetProperty(r => r.MotionHoldChangedAt, clock.GetUtcNow()),
            cancellationToken);
        return await GetStopStateAsync(robotId, cancellationToken);
    }

    public async Task<StopStateResponse> GetStopStateAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
        var stop = await db.RobotCommands.AsNoTracking()
            .Where(c => c.RobotId == robotId && c.Type == RobotCommandType.STOP)
            .OrderByDescending(c => c.IssuedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (stop is null)
        {
            return new StopStateResponse(robotId, StopStates.None, robot.MotionHeld, null, null, null, null, null, null, null);
        }

        var state = StateOf(stop, robot.IsOnline);
        string? mode = null;
        try
        {
            mode = JsonSerializer.Deserialize<StopCommandPayload>(stop.PayloadJson, JsonOptions)?.Mode;
        }
        catch (JsonException)
        {
        }

        return new StopStateResponse(
            robotId, state, robot.MotionHeld, stop.Id, mode, stop.Status.ToString(), stop.Outcome, stop.ErrorCode ?? stop.RejectReasonCode,
            stop.IssuedAt, stop.CompletedAt);
    }

    /// <summary>Pure mapping, unit tested: a stop counts as verified only when the robot reported SUCCEEDED.</summary>
    public static string StateOf(RobotCommand stop, bool robotOnline) => stop.Status switch
    {
        RobotCommandStatus.COMPLETED when stop.Outcome == "SUCCEEDED" => StopStates.StoppedVerified,
        RobotCommandStatus.REJECTED => StopStates.Rejected,
        RobotCommandStatus.SENT when robotOnline => StopStates.Requested,
        RobotCommandStatus.ACKED or RobotCommandStatus.RUNNING when robotOnline => StopStates.Accepted,
        _ => StopStates.Unknown
    };

    // ------------------------------------------------------------------ manual-drive lease (RB-04)

    public async Task<ManualLeaseResponse> AcquireLeaseAsync(
        Guid robotId,
        bool takeover,
        string? reason,
        CancellationToken cancellationToken)
    {
        var me = currentUser.AccountId ?? throw new AppException("Sign in first.", 401, "unauthenticated");
        var now = clock.GetUtcNow();
        var robot = await LoadAsync(robotId, cancellationToken);

        if (!robot.IsEnabled) throw new ConflictException($"Robot {robot.Code} is disabled.", "robot_disabled");
        if (!robot.IsOnline) throw new ConflictException($"Robot {robot.Code} is offline.", "robot_offline");

        var heldByOther = robot.HasActiveManualLease(now) && robot.ManualLeaseHolderId != me;
        if (heldByOther && !takeover)
        {
            throw new ConflictException(
                $"{robot.ManualLeaseHolderName} is driving {robot.Code} until {robot.ManualLeaseUntil:HH:mm:ss}.",
                "manual_lease_held");
        }

        if (heldByOther && (!UserHas(Permissions.RobotManage) || string.IsNullOrWhiteSpace(reason)))
        {
            throw new AppException("Only an administrator may take over a lease, and must give a reason.", 403, "manual_takeover_forbidden");
        }

        // AUTO and manual never share the wheels: no lease while a job command drives the robot, unless it is held.
        if (robot.CurrentCommandId is not null && !robot.MotionHeld)
        {
            throw new ConflictException(
                $"Robot {robot.Code} is executing a command; stop it first.",
                "robot_busy");
        }

        var first = !robot.HasActiveManualLease(now) || robot.ManualLeaseHolderId != me;
        var until = now + LeaseDuration;
        var previousHolder = robot.ManualLeaseHolderId;
        var name = currentUser.Username;

        // Conditional update: two operators acquiring at once cannot both win.
        var updated = await db.Robots
            .Where(r => r.Id == robotId
                        && (r.ManualLeaseHolderId == null || r.ManualLeaseUntil <= now || r.ManualLeaseHolderId == me
                            || (takeover && r.ManualLeaseHolderId == previousHolder)))
            .ExecuteUpdateAsync(
                s => s.SetProperty(r => r.ManualLeaseHolderId, me)
                    .SetProperty(r => r.ManualLeaseHolderName, name)
                    .SetProperty(r => r.ManualLeaseUntil, until),
                cancellationToken);
        if (updated == 0)
        {
            throw new ConflictException("Someone else took the lease a moment ago.", "manual_lease_held");
        }

        if (first)
        {
            await audit.RecordAsync(
                new AuditEntry(
                    heldByOther ? "robot.manual_lease_taken_over" : "robot.manual_lease_granted",
                    "ROBOT",
                    robotId,
                    Before: new Dictionary<string, object?> { ["holderId"] = previousHolder },
                    After: new Dictionary<string, object?> { ["holderId"] = me, ["until"] = until },
                    Reason: reason),
                cancellationToken);
        }

        return new ManualLeaseResponse(robotId, true, me, name, until, true);
    }

    public async Task ReleaseLeaseAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var me = currentUser.AccountId;
        var robot = await LoadAsync(robotId, cancellationToken);
        if (robot.ManualLeaseHolderId is null)
        {
            return;
        }

        if (robot.ManualLeaseHolderId != me && !UserHas(Permissions.RobotManage))
        {
            throw new AppException("Only the lease holder or an administrator can release it.", 403, "manual_lease_not_yours");
        }

        await db.Robots.Where(r => r.Id == robotId).ExecuteUpdateAsync(
            s => s.SetProperty(r => r.ManualLeaseHolderId, (Guid?)null)
                .SetProperty(r => r.ManualLeaseHolderName, (string?)null)
                .SetProperty(r => r.ManualLeaseUntil, (DateTimeOffset?)null),
            cancellationToken);
        await audit.RecordAsync(
            new AuditEntry("robot.manual_lease_released", "ROBOT", robotId,
                Before: new Dictionary<string, object?> { ["holderId"] = robot.ManualLeaseHolderId }),
            cancellationToken);
    }

    public async Task<ManualLeaseResponse> GetLeaseAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
            ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");
        var active = robot.HasActiveManualLease(clock.GetUtcNow());
        return new ManualLeaseResponse(
            robotId,
            active,
            active ? robot.ManualLeaseHolderId : null,
            active ? robot.ManualLeaseHolderName : null,
            active ? robot.ManualLeaseUntil : null,
            active && robot.ManualLeaseHolderId == currentUser.AccountId);
    }

    // ------------------------------------------------------------------ maintenance (RB-08)

    public async Task<MaintenanceRecordResponse> StartMaintenanceAsync(Guid robotId, string reason, CancellationToken cancellationToken)
    {
        var robot = await LoadAsync(robotId, cancellationToken);
        if (robot.Status == RobotStatus.MAINTENANCE)
        {
            throw new ConflictException($"Robot {robot.Code} is already in maintenance.", "robot_in_maintenance");
        }

        if (robot.Status is RobotStatus.RESERVED or RobotStatus.EXECUTING || robot.CurrentCommandId is not null)
        {
            throw new ConflictException($"Robot {robot.Code} is working on a job; finish or cancel it first.", "robot_busy");
        }

        var now = clock.GetUtcNow();
        var record = new MaintenanceRecord
        {
            Id = Guid.NewGuid(),
            RobotId = robotId,
            Reason = Trim(reason, 500) ?? "maintenance",
            StartedBy = currentUser.AccountId,
            StartedByName = currentUser.Username,
            StartedAt = now
        };
        var before = robot.Status;
        robot.Status = RobotStatus.MAINTENANCE;
        robot.MaintenanceReason = record.Reason;
        robot.MaintenanceSince = now;
        robot.UpdatedAt = now;
        db.MaintenanceRecords.Add(record);
        await db.SaveChangesAsync(cancellationToken);

        await audit.RecordAsync(
            new AuditEntry("robot.maintenance_started", "ROBOT", robotId,
                Before: new Dictionary<string, object?> { ["status"] = before.ToString() },
                After: new Dictionary<string, object?> { ["status"] = robot.Status.ToString() },
                Reason: record.Reason),
            cancellationToken);
        return ToResponse(record);
    }

    /// <summary>Back in service only when every check passed; the robot returns AVAILABLE (or OFFLINE if not connected).</summary>
    public async Task<MaintenanceRecordResponse> CompleteMaintenanceAsync(
        Guid robotId,
        MaintenanceChecklist checklist,
        CancellationToken cancellationToken)
    {
        var robot = await LoadAsync(robotId, cancellationToken);
        if (robot.Status != RobotStatus.MAINTENANCE)
        {
            throw new ConflictException($"Robot {robot.Code} is not in maintenance.", "robot_not_in_maintenance");
        }

        var failed = new List<string>();
        if (!checklist.SensorsOk) failed.Add("sensors");
        if (!checklist.LocalizationOk) failed.Add("localization");
        if (!checklist.StopTestOk) failed.Add("stop test");
        if (!checklist.TrafficClear) failed.Add("traffic clear");
        if (failed.Count > 0)
        {
            throw new DomainValidationException(
                $"The robot cannot return to service: {string.Join(", ", failed)} not confirmed.",
                "maintenance_checklist_failed");
        }

        var now = clock.GetUtcNow();
        var record = await db.MaintenanceRecords
            .Where(m => m.RobotId == robotId && m.CompletedAt == null)
            .OrderByDescending(m => m.StartedAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? new MaintenanceRecord { Id = Guid.NewGuid(), RobotId = robotId, Reason = robot.MaintenanceReason ?? "maintenance", StartedAt = robot.MaintenanceSince ?? now };
        if (db.Entry(record).State == EntityState.Detached)
        {
            db.MaintenanceRecords.Add(record);
        }

        record.CompletedAt = now;
        record.CompletedBy = currentUser.AccountId;
        record.CompletedByName = currentUser.Username;
        record.ChecklistJson = JsonSerializer.Serialize(checklist with { Notes = null }, JsonOptions);
        record.Notes = Trim(checklist.Notes, 2000);

        robot.Status = robot.IsOnline ? RobotStatus.AVAILABLE : RobotStatus.OFFLINE;
        robot.MaintenanceReason = null;
        robot.MaintenanceSince = null;
        robot.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);

        await audit.RecordAsync(
            new AuditEntry("robot.maintenance_completed", "ROBOT", robotId,
                Before: new Dictionary<string, object?> { ["status"] = RobotStatus.MAINTENANCE.ToString() },
                After: new Dictionary<string, object?> { ["status"] = robot.Status.ToString(), ["checklist"] = checklist }),
            cancellationToken);
        return ToResponse(record);
    }

    public async Task<IReadOnlyList<MaintenanceRecordResponse>> MaintenanceHistoryAsync(Guid robotId, CancellationToken cancellationToken) =>
        (await db.MaintenanceRecords.AsNoTracking()
            .Where(m => m.RobotId == robotId)
            .OrderByDescending(m => m.StartedAt)
            .Take(50)
            .ToListAsync(cancellationToken))
        .Select(ToResponse)
        .ToList();

    // ------------------------------------------------------------------ system actions (RB-09)

    /// <summary>
    /// RESTART_STACK / REBOOT / SHUTDOWN. Two-step: the caller must type the robot code back. Only when the robot
    /// announced the action, is held (stopped) and has no job. There is no remote power-on: that needs its own circuit.
    /// </summary>
    public async Task<Guid> SystemActionAsync(Guid robotId, string action, string confirmRobotCode, CancellationToken cancellationToken)
    {
        if (!SystemActionPayload.All.Contains(action))
        {
            throw new DomainValidationException("Action must be RESTART_STACK, REBOOT or SHUTDOWN.", "system_action_unknown");
        }

        var robot = await LoadAsync(robotId, cancellationToken);
        if (!string.Equals(confirmRobotCode?.Trim(), robot.Code, StringComparison.Ordinal))
        {
            throw new DomainValidationException($"Type the robot code {robot.Code} to confirm.", "system_action_not_confirmed");
        }

        if (!robot.IsOnline) throw new ConflictException($"Robot {robot.Code} is offline.", "robot_offline");
        if (!robot.Supports(action))
        {
            throw new ConflictException($"Robot {robot.Code} does not support {action}.", "robot_capability_unsupported");
        }

        if (!robot.MotionHeld)
        {
            throw new ConflictException($"Stop robot {robot.Code} first (it must hold motion).", "robot_not_stopped");
        }

        if (robot.Status is RobotStatus.RESERVED or RobotStatus.EXECUTING || robot.CurrentCommandId is not null)
        {
            throw new ConflictException($"Robot {robot.Code} is working on a job.", "robot_busy");
        }

        return await SendAsync(robot, RobotCommandType.SYSTEM_ACTION, RobotCommandTypes.SystemAction,
            new SystemActionPayload { Action = action }, cancellationToken);
    }

    // ------------------------------------------------------------------ localize

    /// <summary>
    /// An operator says the robot stands on this endpoint: the robot sets its pose estimate there (/initialpose).
    /// The pose comes from the endpoint in the database, on the robot's own map. Refused while the robot runs a command,
    /// because moving its belief under a running goal would send it somewhere else; the robot checks that too.
    /// </summary>
    public async Task<Guid> LocalizeAsync(Guid robotId, Guid endpointId, CancellationToken cancellationToken)
    {
        if (navigation is null)
        {
            throw new AppException("Localize is not available.", 503, "localize_unavailable");
        }

        var robot = await LoadAsync(robotId, cancellationToken);
        if (!robot.IsOnline) throw new ConflictException($"Robot {robot.Code} is offline.", "robot_offline");
        if (robot.CurrentCommandId is not null || robot.Status is RobotStatus.EXECUTING)
        {
            throw new ConflictException($"Robot {robot.Code} is running a command; cancel or stop it first.", "robot_busy");
        }

        var pose = await navigation.GetEndpointPoseAsync(endpointId, cancellationToken)
            ?? throw new NotFoundException($"Endpoint '{endpointId}' was not found.", "endpoint_not_found");
        if (pose.MapVersionId != robot.CurrentMapVersionId)
        {
            throw new DomainValidationException(
                $"That endpoint is on another map than robot {robot.Code}.", "endpoint_not_on_robot_map");
        }

        return await SendAsync(robot, RobotCommandType.LOCALIZE, RobotCommandTypes.Localize,
            new { x = pose.X, y = pose.Y, yaw = pose.Yaw, frameId = "map", endpointCode = pose.Code }, cancellationToken);
    }

    // ------------------------------------------------------------------ helpers

    private async Task<Guid> SendAsync(Robot robot, RobotCommandType type, string wireType, object payload, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var commandId = Guid.NewGuid();
        var command = RobotCommand.CreateControl(robot.Id, commandId, type, JsonSerializer.Serialize(payload, JsonOptions), now);
        db.RobotCommands.Add(command);
        await db.SaveChangesAsync(cancellationToken);

        await db.PublishAndStampAsync(
            publisher,
            new RobotCommandMessage
            {
                SchemaVersion = 1,
                MessageId = Guid.NewGuid(),
                CommandId = commandId,
                RobotCode = robot.Code,
                Type = wireType,
                IssuedAt = now,
                Payload = JsonSerializer.SerializeToElement(payload, JsonOptions)
            },
            robot.Id,
            releasesRobot: false,
            cancellationToken);

        await events.PublishAsync(
            new RobotCommandLifecycleChanged(
                command.Id, robot.Id, robot.Code, command.Type.ToString(), command.Status.ToString(),
                null, null, null, null, RobotCommandLifecycleChanged.Phases.Issued),
            cancellationToken);
        return commandId;
    }

    private async Task<Robot> LoadAsync(Guid robotId, CancellationToken cancellationToken) =>
        await db.Robots.FirstOrDefaultAsync(r => r.Id == robotId, cancellationToken)
        ?? throw new NotFoundException($"Robot '{robotId}' was not found.", "robot_not_found");

    private bool UserHas(string permission) =>
        RolePermissionMatrix.UserHas(httpContextAccessor.HttpContext?.User ?? new ClaimsPrincipal(), permission);

    private static string? Trim(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim() is var t && t.Length > max ? t[..max] : value.Trim();

    private static MaintenanceRecordResponse ToResponse(MaintenanceRecord m) =>
        new(m.Id, m.Reason, m.StartedByName, m.StartedAt, m.CompletedByName, m.CompletedAt, m.ChecklistJson, m.Notes);
}
