using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Features.RobotControl;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Navigation.Contracts;

namespace WaroTrans.Fleet.Features.Mapping;

public sealed record MappingRobotResponse(
    Guid Id,
    string Code,
    string Name,
    bool IsOnline,
    string Status,
    bool Available,
    IReadOnlyList<string> Reasons,
    Guid? OpenSessionId);

public sealed record MappingSessionResponse(
    Guid Id,
    Guid WarehouseId,
    Guid RobotId,
    string RobotCode,
    string Status,
    string? MapName,
    string? StartedByName,
    DateTimeOffset StartedAt,
    DateTimeOffset? MappingSince,
    DateTimeOffset? EndedAt,
    string? ErrorCode,
    string? ErrorMessage,
    Guid? ResultMapVersionId,
    string? ResultMapVersionCode,
    double? KnownAreaM2,
    int? MapWidth,
    int? MapHeight,
    string? RobotPath,
    bool RobotOnline,
    string? RobotReportedMap,
    bool LeaseHeldByMe)
{
    public static MappingSessionResponse From(MappingSession s, Robot? robot, Guid? me) => new(
        s.Id, s.WarehouseId, s.RobotId, s.RobotCode, s.Status.ToString(), s.MapName, s.StartedByName, s.StartedAt,
        s.MappingSince, s.EndedAt, s.ErrorCode, s.ErrorMessage, s.ResultMapVersionId, s.ResultMapVersionCode,
        s.KnownAreaM2, s.MapWidth, s.MapHeight, s.RobotPath,
        robot?.IsOnline ?? false, robot?.MapVersionCode,
        robot is not null && me is not null && robot.ManualLeaseHolderId == me && robot.ManualLeaseUntil > DateTimeOffset.UtcNow);
}

public sealed record MappingPreviewResponse(
    Guid SessionId,
    long Seq,
    JsonElement? Pose,
    JsonElement? Map,
    string? RobotState,
    double? ElapsedSec,
    DateTimeOffset? ReceivedAt,
    DateTimeOffset? MapReceivedAt);

/// <summary>
/// Map building from the web (Facility → Build map): one robot, driven by hand while slam_toolbox maps; finishing turns
/// the map into a DRAFT map version. The robot does the mapping (START_MAPPING / STOP_MAPPING); this keeps the session,
/// follows the two commands, takes the finished map in and imports it.
/// </summary>
public sealed class MappingService(
    FleetDbContext db,
    RobotControlService control,
    MappingLiveStore live,
    ICurrentUser currentUser,
    TimeProvider clock,
    ILogger<MappingService> logger,
    IScannedMapImporter? importer = null)
{
    public const string ReportedMappingCode = "MAPPING";

    /// <summary>START: pause localization, start slam_toolbox, first map. 30 s on the robot plus delivery.</summary>
    public static readonly TimeSpan StartTimeout = TimeSpan.FromSeconds(90);

    /// <summary>STOP: pose graph, map, chunks, localization back. Then the chunks must have arrived.</summary>
    public static readonly TimeSpan StopTimeout = TimeSpan.FromSeconds(120);

    /// <summary>The robot reports it is not mapping (gateway restarted) for this long: the session is lost.</summary>
    public static readonly TimeSpan LeftMappingAfter = TimeSpan.FromSeconds(20);

    /// <summary>Offline this long while mapping: given up (slam_toolbox's map lives only in the robot's memory).</summary>
    public static readonly TimeSpan OfflineGiveUpAfter = TimeSpan.FromMinutes(10);

    // ------------------------------------------------------------------ robots

    /// <summary>Why a robot cannot start mapping now (empty = it can).</summary>
    public static IReadOnlyList<string> Blockers(Robot robot, DateTimeOffset now, Guid? me, bool hasOpenSession)
    {
        var reasons = new List<string>();
        if (!robot.IsEnabled) reasons.Add("robot_disabled");
        if (!robot.IsOnline) reasons.Add("robot_offline");
        if (robot.Status == RobotStatus.MAINTENANCE) reasons.Add("robot_in_maintenance");
        if (robot.CurrentCommandId is not null || robot.Status is RobotStatus.RESERVED or RobotStatus.EXECUTING) reasons.Add("robot_busy");
        if (robot.MotionHeld) reasons.Add("robot_motion_held");
        if (robot.HasActiveManualLease(now) && robot.ManualLeaseHolderId != me) reasons.Add("robot_manual_mode");
        if (hasOpenSession || string.Equals(robot.MapVersionCode, ReportedMappingCode, StringComparison.OrdinalIgnoreCase))
        {
            reasons.Add("mapping_session_open");
        }

        return reasons;
    }

    public async Task<IReadOnlyList<MappingRobotResponse>> ListRobotsAsync(Guid warehouseId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var robots = await db.Robots.AsNoTracking().Where(r => r.WarehouseId == warehouseId).OrderBy(r => r.Code).ToListAsync(ct);
        var ids = robots.Select(r => r.Id).ToList();
        var open = await db.MappingSessions.AsNoTracking()
            .Where(s => ids.Contains(s.RobotId) && MappingSession.OpenStatuses.Contains(s.Status))
            .ToDictionaryAsync(s => s.RobotId, s => s.Id, ct);
        return robots.Select(r =>
        {
            var reasons = Blockers(r, now, currentUser.AccountId, open.ContainsKey(r.Id));
            return new MappingRobotResponse(r.Id, r.Code, r.Name, r.IsOnline, r.Status.ToString(), reasons.Count == 0, reasons,
                open.TryGetValue(r.Id, out var sid) ? sid : null);
        }).ToList();
    }

    // ------------------------------------------------------------------ session lifecycle

    public async Task<MappingSessionResponse> StartAsync(Guid robotId, CancellationToken ct)
    {
        var robot = await control.LoadRobotAsync(robotId, ct);
        var now = clock.GetUtcNow();
        var hasOpen = await db.MappingSessions.AnyAsync(s => s.RobotId == robot.Id && MappingSession.OpenStatuses.Contains(s.Status), ct);
        var blockers = Blockers(robot, now, currentUser.AccountId, hasOpen);
        if (blockers.Count > 0)
        {
            var code = blockers[0];
            throw new ConflictException($"Robot {robot.Code} cannot start mapping: {string.Join(", ", blockers)}.", code);
        }

        var session = new MappingSession
        {
            Id = Guid.NewGuid(),
            WarehouseId = robot.WarehouseId,
            RobotId = robot.Id,
            RobotCode = robot.Code,
            Status = MappingSessionStatus.STARTING,
            StartedById = currentUser.AccountId,
            StartedByName = currentUser.Username,
            StartedAt = now,
            UpdatedAt = now
        };
        db.MappingSessions.Add(session);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            throw new ConflictException($"Robot {robot.Code} already has a mapping session.", "mapping_session_open");
        }

        live.Forget(robot.Code);
        session.StartCommandId = await control.SendControlAsync(
            robot, RobotCommandType.START_MAPPING, RobotCommandTypes.StartMapping, new { sessionId = session.Id }, ct);
        await db.SaveChangesAsync(ct);
        return MappingSessionResponse.From(session, robot, currentUser.AccountId);
    }

    public async Task<MappingSessionResponse> FinishAsync(Guid sessionId, string? name, CancellationToken ct)
    {
        var session = await LoadAsync(sessionId, ct);
        await ReconcileAsync(session, ct);
        if (session.Status != MappingSessionStatus.MAPPING)
        {
            throw new ConflictException($"The mapping session is {session.Status}, not MAPPING.", "mapping_session_not_mapping");
        }

        var robot = await control.LoadRobotAsync(session.RobotId, ct);
        if (!robot.IsOnline) throw new ConflictException($"Robot {robot.Code} is offline.", "robot_offline");
        var now = clock.GetUtcNow();
        session.MapName = string.IsNullOrWhiteSpace(name)
            ? $"Map built by {robot.Code} {now.ToLocalTime():yyyy-MM-dd HH:mm}"
            : name.Trim()[..Math.Min(name.Trim().Length, 200)];
        session.Status = MappingSessionStatus.SAVING;
        session.StopRequestedAt = now;
        session.ErrorCode = null;
        session.ErrorMessage = null;
        session.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        session.StopCommandId = await control.SendControlAsync(
            robot, RobotCommandType.STOP_MAPPING, RobotCommandTypes.StopMapping, new { sessionId = session.Id, save = true }, ct);
        await db.SaveChangesAsync(ct);
        return MappingSessionResponse.From(session, robot, currentUser.AccountId);
    }

    public async Task<MappingSessionResponse> CancelAsync(Guid sessionId, CancellationToken ct)
    {
        var session = await LoadAsync(sessionId, ct);
        await ReconcileAsync(session, ct);
        if (!session.IsOpen)
        {
            throw new ConflictException($"The mapping session is already {session.Status}.", "mapping_session_closed");
        }

        if (session.Status == MappingSessionStatus.CANCELLING)
        {
            return await ToResponseAsync(session, ct);
        }

        var robot = await control.LoadRobotAsync(session.RobotId, ct);
        var now = clock.GetUtcNow();
        if (!robot.IsOnline)
        {
            // Nothing can reach it; a restarted gateway is not mapping anymore anyway.
            session.Status = MappingSessionStatus.CANCELLED;
            session.ErrorCode = "robot_offline";
            session.ErrorMessage = "Cancelled while the robot was offline; if it is still mapping, cancel again when it is back.";
            session.EndedAt = now;
            session.UpdatedAt = now;
            await db.SaveChangesAsync(ct);
            return MappingSessionResponse.From(session, robot, currentUser.AccountId);
        }

        session.Status = MappingSessionStatus.CANCELLING;
        session.StopRequestedAt = now;
        session.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
        session.StopCommandId = await control.SendControlAsync(
            robot, RobotCommandType.STOP_MAPPING, RobotCommandTypes.StopMapping, new { sessionId = session.Id, save = false }, ct);
        await db.SaveChangesAsync(ct);
        return MappingSessionResponse.From(session, robot, currentUser.AccountId);
    }

    public async Task<MappingSessionResponse> GetAsync(Guid sessionId, CancellationToken ct)
    {
        var session = await LoadAsync(sessionId, ct);
        await ReconcileAsync(session, ct);
        return await ToResponseAsync(session, ct);
    }

    /// <summary>Open sessions of a warehouse (to resume one after a reload), newest first, plus the latest closed one.</summary>
    public async Task<IReadOnlyList<MappingSessionResponse>> ListAsync(Guid warehouseId, bool openOnly, CancellationToken ct)
    {
        var query = db.MappingSessions.Where(s => s.WarehouseId == warehouseId);
        if (openOnly) query = query.Where(s => MappingSession.OpenStatuses.Contains(s.Status));
        var sessions = await query.OrderByDescending(s => s.StartedAt).Take(20).ToListAsync(ct);
        var result = new List<MappingSessionResponse>();
        foreach (var session in sessions)
        {
            await ReconcileAsync(session, ct);
            if (openOnly && !session.IsOpen) continue;
            result.Add(await ToResponseAsync(session, ct));
        }

        return result;
    }

    public async Task<MappingPreviewResponse> PreviewAsync(Guid sessionId, CancellationToken ct)
    {
        var session = await db.MappingSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId, ct)
                      ?? throw new NotFoundException($"Mapping session '{sessionId}' was not found.", "mapping_session_not_found");
        var preview = live.GetPreview(session.RobotCode, session.Id);
        return preview is null
            ? new MappingPreviewResponse(session.Id, 0, null, null, null, null, null, null)
            : new MappingPreviewResponse(session.Id, preview.Seq, preview.Pose, preview.Map, preview.State, preview.ElapsedSec,
                preview.ReceivedAt, preview.MapReceivedAt);
    }

    // ------------------------------------------------------------------ robot uplink

    public void OnPreview(string robotCode, string payload) => live.PutPreview(robotCode, payload);

    /// <summary>One chunk; the last one turns the session's map into a DRAFT map version.</summary>
    public async Task OnUploadChunkAsync(string robotCode, string payload, CancellationToken ct)
    {
        MappingUpload? upload;
        try
        {
            upload = live.AddChunk(payload);
        }
        catch (Exception ex) when (ex is InvalidDataException or JsonException or FormatException or KeyNotFoundException)
        {
            logger.LogWarning("Mapping upload from {Robot} rejected: {Reason}", robotCode, ex.Message);
            await FailUploadAsync(robotCode, payload, ex.Message, ct);
            return;
        }

        if (upload is null || !Guid.TryParse(upload.SessionId, out var sessionId)) return;
        var session = await db.MappingSessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct);
        if (session is null || !string.Equals(session.RobotCode, robotCode, StringComparison.OrdinalIgnoreCase))
        {
            logger.LogWarning("Mapping upload for unknown session {Session} from {Robot}", upload.SessionId, robotCode);
            return;
        }

        if (session.ResultMapVersionId is not null)
        {
            return; // already imported (a redelivered last chunk)
        }

        await ImportAsync(session, upload, ct);
    }

    private async Task ImportAsync(MappingSession session, MappingUpload upload, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        if (importer is null)
        {
            session.Fail("mapping_import_unavailable", "Map import is not available on this host.", now);
            await db.SaveChangesAsync(ct);
            return;
        }

        try
        {
            var name = session.MapName ?? $"Map built by {session.RobotCode} {now.ToLocalTime():yyyy-MM-dd HH:mm}";
            var map = await importer.ImportScannedMapAsync(session.WarehouseId, upload.Pgm, upload.Yaml, name, ct);
            session.ResultMapVersionId = map.Id;
            session.ResultMapVersionCode = map.Code;
            session.MapWidth = upload.Width;
            session.MapHeight = upload.Height;
            session.KnownAreaM2 = upload.KnownAreaM2 ?? session.KnownAreaM2;
            session.RobotPath = upload.RobotPath ?? session.RobotPath;
            session.Status = MappingSessionStatus.COMPLETED;
            session.EndedAt = now;
            session.UpdatedAt = now;
            logger.LogInformation("Mapping session {Session} ({Robot}) saved as DRAFT {Map}", session.Id, session.RobotCode, map.Code);
        }
        catch (AppException ex)
        {
            session.Fail("mapping_import_failed", ex.Message, now);
        }

        await db.SaveChangesAsync(ct);
    }

    private async Task FailUploadAsync(string robotCode, string payload, string reason, CancellationToken ct)
    {
        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (!doc.RootElement.TryGetProperty("sessionId", out var s) || !Guid.TryParse(s.GetString(), out var id)) return;
            var session = await db.MappingSessions.FirstOrDefaultAsync(x => x.Id == id && x.RobotCode == robotCode, ct);
            if (session is null || session.Status != MappingSessionStatus.SAVING) return;
            session.Fail("mapping_upload_invalid", reason, clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
        }
        catch (JsonException)
        {
            // nothing to attach it to
        }
    }

    // ------------------------------------------------------------------ state from the robot's answers

    /// <summary>Moves an open session on from what its commands and the robot say. Saves when it changed.</summary>
    public async Task<bool> ReconcileAsync(MappingSession session, CancellationToken ct)
    {
        if (!session.IsOpen) return false;
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == session.RobotId, ct);
        var start = await CommandAsync(session.StartCommandId, ct);
        var stop = await CommandAsync(session.StopCommandId, ct);
        if (!Advance(session, robot, start, stop, clock.GetUtcNow())) return false;
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>
    /// The session's next state from its START / STOP commands and the robot (pure, no I/O). True when it changed.
    /// The map arriving (OnUploadChunkAsync) is what completes a SAVING session; this only fails it when it does not come.
    /// </summary>
    public static bool Advance(MappingSession session, Robot? robot, RobotCommand? start, RobotCommand? stop, DateTimeOffset now)
    {
        if (!session.IsOpen) return false;
        var before = (session.Status, session.ErrorCode);
        switch (session.Status)
        {
            case MappingSessionStatus.STARTING:
                AdvanceStart(session, start, now);
                break;
            case MappingSessionStatus.MAPPING:
                AdvanceMapping(session, robot, now);
                break;
            case MappingSessionStatus.SAVING:
            case MappingSessionStatus.CANCELLING:
                AdvanceStop(session, stop, now);
                break;
        }

        if (before == (session.Status, session.ErrorCode)) return false;
        session.UpdatedAt = now;
        return true;
    }

    private static void AdvanceStart(MappingSession session, RobotCommand? command, DateTimeOffset now)
    {
        if (command is null)
        {
            if (now - session.StartedAt > StartTimeout) session.Fail("mapping_start_timeout", "START_MAPPING was never sent.", now);
            return;
        }

        switch (command.Status)
        {
            case RobotCommandStatus.COMPLETED:
                session.Status = MappingSessionStatus.MAPPING;
                session.MappingSince = command.CompletedAt ?? now;
                break;
            case RobotCommandStatus.REJECTED:
                session.Fail(RejectCode(command.RejectReasonCode), $"The robot refused START_MAPPING ({command.RejectReasonCode}).", now);
                break;
            case RobotCommandStatus.FAILED or RobotCommandStatus.CANCELED:
                session.Fail(command.ErrorCode ?? "MAPPING_START_FAILED", "The robot could not start mapping; localization was put back.", now);
                break;
            case RobotCommandStatus.TIMEOUT or RobotCommandStatus.ABORTED:
                session.Fail("mapping_start_timeout", $"No answer to START_MAPPING ({command.ErrorCode ?? command.Status.ToString()}).", now);
                break;
            default:
                if (now - session.StartedAt > StartTimeout)
                {
                    session.Fail("mapping_start_timeout", "The robot did not finish starting the mapping in time.", now);
                }

                break;
        }
    }

    private static void AdvanceMapping(MappingSession session, Robot? robot, DateTimeOffset now)
    {
        if (robot is null)
        {
            session.Fail("robot_not_found", "The robot was removed.", now);
            return;
        }

        if (!robot.IsOnline)
        {
            if (robot.LastHeartbeatAt is { } seen && now - seen > OfflineGiveUpAfter)
            {
                session.Fail("robot_offline", "The robot has been offline too long; the map being built is lost.", now);
            }

            return;
        }

        // A gateway that restarted is not mapping any more: telemetry since mapping began says another map.
        var since = session.StopRequestedAt ?? session.MappingSince ?? session.StartedAt;
        if (robot.LastTelemetryAt is { } at && at - since > LeftMappingAfter
            && !string.Equals(robot.MapVersionCode, ReportedMappingCode, StringComparison.OrdinalIgnoreCase))
        {
            session.Fail("mapping_lost", $"The robot is not mapping any more (it reports map {robot.MapVersionCode ?? "-"}).", now);
        }
    }

    private static void AdvanceStop(MappingSession session, RobotCommand? command, DateTimeOffset now)
    {
        var saving = session.Status == MappingSessionStatus.SAVING;
        var asked = session.StopRequestedAt ?? now;
        if (command is null)
        {
            if (now - asked > StopTimeout) session.Fail("mapping_stop_timeout", "STOP_MAPPING was never sent.", now);
            return;
        }

        var result = ParseResult(command.ResultJson);
        if (result.RobotPath is not null) session.RobotPath = result.RobotPath;
        if (result.KnownAreaM2 is not null) session.KnownAreaM2 = result.KnownAreaM2;
        switch (command.Status)
        {
            case RobotCommandStatus.COMPLETED when !saving:
                session.Status = MappingSessionStatus.CANCELLED;
                session.EndedAt = now;
                break;
            case RobotCommandStatus.COMPLETED:
                // The map comes in chunks (normally before this result); the last chunk completes the session.
                if (command.CompletedAt is { } done && now - done > TimeSpan.FromSeconds(60))
                {
                    session.Fail("mapping_upload_incomplete",
                        $"The robot sent the map but it did not all arrive. It is kept on the robot at {session.RobotPath ?? "its mapping folder"}.", now);
                }

                break;
            case RobotCommandStatus.REJECTED when command.RejectReasonCode == "MAPPING_NOT_ACTIVE":
                session.Fail("mapping_lost", "The robot is not mapping any more.", now);
                break;
            case RobotCommandStatus.REJECTED:
                // The robot is still mapping: back to MAPPING so the operator can retry or cancel.
                session.Status = MappingSessionStatus.MAPPING;
                session.ErrorCode = RejectCode(command.RejectReasonCode);
                session.ErrorMessage = $"The robot refused STOP_MAPPING ({command.RejectReasonCode}).";
                break;
            case RobotCommandStatus.FAILED when command.ErrorCode == "MAPPING_LOCALIZATION_RESUME_FAILED":
                if (saving) return; // the map was sent: the upload completes the session; localization needs a look
                session.Fail(command.ErrorCode, "Mapping stopped but localization did not come back; restart the robot stack.", now);
                break;
            case RobotCommandStatus.FAILED or RobotCommandStatus.CANCELED:
                // Saving failed on the robot (no map / upload queue full): it keeps mapping.
                session.Status = MappingSessionStatus.MAPPING;
                session.ErrorCode = command.ErrorCode ?? "MAPPING_STOP_FAILED";
                session.ErrorMessage = "The robot could not save the map; it is still mapping. Try again or cancel.";
                break;
            case RobotCommandStatus.TIMEOUT or RobotCommandStatus.ABORTED:
                session.Fail("mapping_stop_timeout", $"No answer to STOP_MAPPING ({command.ErrorCode ?? command.Status.ToString()}).", now);
                break;
            default:
                if (now - asked > StopTimeout)
                {
                    session.Fail("mapping_stop_timeout", "The robot did not finish stopping the mapping in time.", now);
                }

                break;
        }
    }

    private sealed record StopResult(string? RobotPath, double? KnownAreaM2);

    private static StopResult ParseResult(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new StopResult(null, null);
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var path = root.TryGetProperty("robotPath", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
            double? area = root.TryGetProperty("knownAreaM2", out var a) && a.TryGetDouble(out var v) ? v : null;
            return new StopResult(path, area);
        }
        catch (JsonException)
        {
            return new StopResult(null, null);
        }
    }

    private static string RejectCode(string? reason) => reason switch
    {
        "UNSUPPORTED_COMMAND" => "mapping_unsupported",
        "BUSY" => "robot_busy",
        null or "" => "mapping_rejected",
        _ => reason
    };

    private async Task<RobotCommand?> CommandAsync(Guid? id, CancellationToken ct) =>
        id is null ? null : await db.RobotCommands.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);

    private async Task<MappingSession> LoadAsync(Guid sessionId, CancellationToken ct) =>
        await db.MappingSessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct)
        ?? throw new NotFoundException($"Mapping session '{sessionId}' was not found.", "mapping_session_not_found");

    private async Task<MappingSessionResponse> ToResponseAsync(MappingSession session, CancellationToken ct)
    {
        var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == session.RobotId, ct);
        return MappingSessionResponse.From(session, robot, currentUser.AccountId);
    }
}
