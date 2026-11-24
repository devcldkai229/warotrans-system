using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Entities;
using WaroTrans.Fleet.Enums;

namespace WaroTrans.Fleet.Features.RobotControl;

/// <summary>One place where the robot could stand, sent to the robot to check against its scan.</summary>
public sealed record AutoLocalizeCandidate(double X, double Y, double? Yaw, string? EndpointCode, string Source);

/// <summary>A pose the robot's scan fits, best first; a person confirms one with LOCALIZE at that pose.</summary>
public sealed record AutoLocalizeSuggestion(double X, double Y, double Yaw, double Score, string? EndpointCode, string Source);

/// <summary>
/// The latest AUTO_LOCALIZE of a robot. State NONE (never asked), RUNNING, SUCCEEDED, FAILED (the robot answered but took
/// no pose: see ErrorCode and Suggestions), REJECTED (the robot refused it, ReasonCode) or TIMEOUT.
/// Method CANDIDATE_MATCH / GLOBAL_SPIN / NONE.
/// </summary>
public sealed record AutoLocalizeStatusResponse(
    Guid RobotId,
    Guid? CommandId,
    string State,
    string? Method,
    string? ErrorCode,
    string? RejectReason,
    string? MatchReason,
    double? Score,
    double? Margin,
    string? EndpointCode,
    double? X,
    double? Y,
    double? Yaw,
    IReadOnlyList<AutoLocalizeSuggestion> Suggestions,
    bool AllowSpin,
    string? Trigger,
    string? Detail,
    DateTimeOffset? IssuedAt,
    DateTimeOffset? CompletedAt);

public static class AutoLocalizeTriggers
{
    public const string Operator = "OPERATOR";
    public const string Auto = "AUTO";
    public const string MapChanged = "MAP_CHANGED";
}

public sealed partial class RobotControlService
{
    /// <summary>An AUTO_LOCALIZE still running after this long is given up (matching ~2 s, a spin ~30 s).</summary>
    public static readonly TimeSpan AutoLocalizeStaleAfter = TimeSpan.FromSeconds(120);

    /// <summary>
    /// The robot finds where it stands by itself. Candidates: its last localized pose on this map, its home endpoint,
    /// every enabled endpoint of its map. A turn on the spot (global localization) only when <paramref name="allowSpin"/>.
    /// Refused while it runs a command or is driven by hand, like LOCALIZE.
    /// </summary>
    public async Task<Guid> AutoLocalizeAsync(Guid robotId, bool allowSpin, string trigger, CancellationToken cancellationToken)
    {
        if (navigation is null)
        {
            throw new AppException("Localize is not available.", 503, "localize_unavailable");
        }

        var robot = await LoadAsync(robotId, cancellationToken);
        var now = clock.GetUtcNow();
        if (!robot.IsOnline) throw new ConflictException($"Robot {robot.Code} is offline.", "robot_offline");
        if (robot.CurrentCommandId is not null || robot.Status is RobotStatus.EXECUTING)
        {
            throw new ConflictException($"Robot {robot.Code} is running a command; cancel or stop it first.", "robot_busy");
        }

        if (robot.HasActiveManualLease(now))
        {
            throw new ConflictException($"Robot {robot.Code} is being driven by hand.", "robot_manual_mode");
        }

        await ExpireStaleAutoLocalizeAsync(robot.Id, now, cancellationToken);
        var running = await db.RobotCommands.AnyAsync(
            c => c.RobotId == robot.Id && c.Type == RobotCommandType.AUTO_LOCALIZE
                 && (c.Status == RobotCommandStatus.SENT || c.Status == RobotCommandStatus.ACKED || c.Status == RobotCommandStatus.RUNNING),
            cancellationToken);
        if (running)
        {
            throw new ConflictException($"Robot {robot.Code} is already localizing itself.", "auto_localize_running");
        }

        var candidates = await CandidatesAsync(robot, cancellationToken);
        if (candidates.Count == 0)
        {
            throw new ConflictException($"The map of robot {robot.Code} has no endpoint to localize against.", "auto_localize_no_candidates");
        }

        return await SendAsync(robot, RobotCommandType.AUTO_LOCALIZE, RobotCommandTypes.AutoLocalize,
            new
            {
                candidates = candidates.Select(c => new { x = c.X, y = c.Y, yaw = c.Yaw, endpointCode = c.EndpointCode, source = c.Source }),
                allowSpin,
                trigger,
                mapVersionId = robot.CurrentMapVersionId
            },
            cancellationToken);
    }

    /// <summary>A person confirms where the robot stands by a pose (a suggestion of AUTO_LOCALIZE), not an endpoint.</summary>
    public async Task<Guid> LocalizeAtPoseAsync(Guid robotId, double x, double y, double yaw, CancellationToken cancellationToken)
    {
        if (!double.IsFinite(x) || !double.IsFinite(y) || !double.IsFinite(yaw))
        {
            throw new DomainValidationException("The pose must be finite numbers.", "invalid_pose");
        }

        var robot = await LoadAsync(robotId, cancellationToken);
        if (!robot.IsOnline) throw new ConflictException($"Robot {robot.Code} is offline.", "robot_offline");
        if (robot.CurrentCommandId is not null || robot.Status is RobotStatus.EXECUTING)
        {
            throw new ConflictException($"Robot {robot.Code} is running a command; cancel or stop it first.", "robot_busy");
        }

        return await SendAsync(robot, RobotCommandType.LOCALIZE, RobotCommandTypes.Localize,
            new { x, y, yaw, frameId = "map", endpointCode = (string?)null }, cancellationToken);
    }

    public async Task<AutoLocalizeStatusResponse> GetAutoLocalizeAsync(Guid robotId, CancellationToken cancellationToken)
    {
        var robot = await LoadAsync(robotId, cancellationToken);
        await ExpireStaleAutoLocalizeAsync(robot.Id, clock.GetUtcNow(), cancellationToken);
        var command = await db.RobotCommands.AsNoTracking()
            .Where(c => c.RobotId == robot.Id && c.Type == RobotCommandType.AUTO_LOCALIZE)
            .OrderByDescending(c => c.IssuedAt)
            .FirstOrDefaultAsync(cancellationToken);
        return ToAutoLocalizeStatus(robot.Id, command);
    }

    /// <summary>The candidate poses for a robot, best guesses first (last pose, home), then every endpoint.</summary>
    public async Task<IReadOnlyList<AutoLocalizeCandidate>> CandidatesAsync(Robot robot, CancellationToken cancellationToken)
    {
        var map = navigation is null ? null : await navigation.GetMapVersionAsync(robot.CurrentMapVersionId, cancellationToken);

        // The last pose counts only when it was taken on this very map (the robot reports the map code with it).
        RobotPoseSample? last = null;
        if (map?.Code is { } mapCode)
        {
            last = await db.RobotPoseSamples.AsNoTracking()
                .Where(p => p.RobotId == robot.Id && p.MapVersionCode == mapCode)
                .OrderByDescending(p => p.RecordedAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var endpoints = navigation is null
            ? []
            : await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken);
        string? homeCode = null;
        if (traffic?.Value.RobotHomeEndpoints is { } homes && homes.TryGetValue(robot.Code, out var configured))
        {
            homeCode = configured;
        }

        return BuildCandidates(last, endpoints, homeCode);
    }

    /// <summary>Last pose on this map first, then the home endpoint, then the other enabled endpoints by code.</summary>
    public static IReadOnlyList<AutoLocalizeCandidate> BuildCandidates(
        RobotPoseSample? lastPoseOnThisMap,
        IEnumerable<WaroTrans.Navigation.Contracts.EndpointPoseWithType> endpoints,
        string? homeCode)
    {
        var list = new List<AutoLocalizeCandidate>();
        if (lastPoseOnThisMap is { } last)
        {
            list.Add(new AutoLocalizeCandidate(last.X, last.Y, last.Yaw, null, "LAST_POSE"));
        }

        bool IsHome(string code) => homeCode is not null && string.Equals(code, homeCode, StringComparison.OrdinalIgnoreCase);
        foreach (var endpoint in endpoints.Where(e => e.IsEnabled)
                     .OrderBy(e => IsHome(e.Code) ? 0 : 1)
                     .ThenBy(e => e.Code, StringComparer.Ordinal))
        {
            list.Add(new AutoLocalizeCandidate(endpoint.X, endpoint.Y, endpoint.Yaw, endpoint.Code, IsHome(endpoint.Code) ? "HOME" : "ENDPOINT"));
        }

        return list;
    }

    /// <summary>An AUTO_LOCALIZE the robot never finished (crashed, restarted mid-run) is closed as TIMEOUT.</summary>
    public async Task ExpireStaleAutoLocalizeAsync(Guid robotId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var cutoff = now - AutoLocalizeStaleAfter;
        var stale = await db.RobotCommands
            .Where(c => c.RobotId == robotId && c.Type == RobotCommandType.AUTO_LOCALIZE
                        && (c.Status == RobotCommandStatus.SENT || c.Status == RobotCommandStatus.ACKED || c.Status == RobotCommandStatus.RUNNING)
                        && c.IssuedAt < cutoff)
            .ToListAsync(cancellationToken);
        if (stale.Count == 0) return;
        foreach (var command in stale)
        {
            if (!command.TryMarkAckTimeout(now)) command.TryMarkResultTimeout(now);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public static AutoLocalizeStatusResponse ToAutoLocalizeStatus(Guid robotId, RobotCommand? command)
    {
        if (command is null)
        {
            return new AutoLocalizeStatusResponse(robotId, null, "NONE", null, null, null, null, null, null, null, null, null, null, [], false, null, null, null, null);
        }

        var state = command.Status switch
        {
            RobotCommandStatus.SENT or RobotCommandStatus.ACKED or RobotCommandStatus.RUNNING => "RUNNING",
            RobotCommandStatus.COMPLETED => "SUCCEEDED",
            RobotCommandStatus.REJECTED => "REJECTED",
            RobotCommandStatus.TIMEOUT => "TIMEOUT",
            _ => "FAILED"
        };

        var allowSpin = false;
        string? trigger = null;
        using (var payload = JsonDocument.Parse(string.IsNullOrWhiteSpace(command.PayloadJson) ? "{}" : command.PayloadJson))
        {
            if (payload.RootElement.TryGetProperty("allowSpin", out var spin) && spin.ValueKind == JsonValueKind.True) allowSpin = true;
            if (payload.RootElement.TryGetProperty("trigger", out var t) && t.ValueKind == JsonValueKind.String) trigger = t.GetString();
        }

        string? method = null, matchReason = null, endpointCode = null, detail = null;
        double? score = null, margin = null, x = null, y = null, yaw = null;
        var suggestions = new List<AutoLocalizeSuggestion>();
        if (!string.IsNullOrWhiteSpace(command.ResultJson))
        {
            using var result = JsonDocument.Parse(command.ResultJson);
            var root = result.RootElement;
            method = Text(root, "method");
            matchReason = Text(root, "reason");
            endpointCode = Text(root, "endpointCode");
            detail = Text(root, "detail");
            score = Number(root, "score");
            margin = Number(root, "margin");
            x = Number(root, "x");
            y = Number(root, "y");
            yaw = Number(root, "yaw");
            if (root.TryGetProperty("suggestions", out var list) && list.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in list.EnumerateArray().Take(5))
                {
                    if (Number(item, "x") is { } sx && Number(item, "y") is { } sy)
                    {
                        suggestions.Add(new AutoLocalizeSuggestion(
                            sx, sy, Number(item, "yaw") ?? 0, Number(item, "score") ?? 0, Text(item, "endpointCode"), Text(item, "source") ?? "ENDPOINT"));
                    }
                }
            }
        }

        return new AutoLocalizeStatusResponse(
            robotId, command.Id, state, method, command.ErrorCode, command.RejectReasonCode, matchReason, score, margin,
            endpointCode, x, y, yaw, suggestions, allowSpin, trigger, detail, command.IssuedAt, command.CompletedAt);

        static string? Text(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        static double? Number(JsonElement e, string name) =>
            e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;
    }
}
