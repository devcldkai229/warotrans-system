using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.Fleet.Enums;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.RobotHistory;

/// <summary>One line of history: a state change or a command, whichever happened.</summary>
public sealed record RobotHistoryItem(
    string Kind,
    DateTimeOffset OccurredAt,
    string? FromStatus,
    string? ToStatus,
    string? Reason,
    string? Source,
    Guid? JobId,
    Guid? CommandId,
    string? CommandType,
    string? CommandStatus,
    string? CommandOutcome,
    Guid? JobStepId,
    /// <summary>STATE only: what was true of the robot then (<c>batteryPercent</c>, <c>errorCode</c>). Null on lines written before this was kept.</summary>
    JsonElement? Details,
    /// <summary>The Job number (J…) of <see cref="JobId"/>, when known.</summary>
    string? JobNo = null,
    /// <summary>COMMAND: where a MOVE went (the endpoint at its goal, else "x, y"), the STOP mode, the system action …</summary>
    string? Target = null,
    /// <summary>COMMAND: why it was refused or failed (robot reason code / error code).</summary>
    string? ErrorCode = null,
    /// <summary>COMMAND: the operator's reason (STOP).</summary>
    string? Note = null,
    DateTimeOffset? CompletedAt = null,
    /// <summary>TICKET: the technical ticket.</summary>
    Guid? TicketId = null,
    string? TicketNo = null,
    string? TicketType = null,
    string? TicketTitle = null,
    string? TicketResult = null,
    string? ByName = null);

/// <summary>BOTH-02: what a robot went through, newest first. No heartbeat noise, because none is written.</summary>
public static class RobotHistoryEndpoints
{
    public const int MaxTake = 200;

    public static RouteGroupBuilder MapRobotHistory(this RouteGroupBuilder group)
    {
        group.MapGet("/robots/{id:guid}/state-history", async (
                Guid id, DateTimeOffset? from, DateTimeOffset? to, string? kind, string? source, int? skip, int? take,
                FleetDbContext db, IServiceProvider services, CancellationToken cancellationToken) =>
            {
                var navigation = services.GetService(typeof(WaroTrans.Navigation.Contracts.INavigationModule)) as WaroTrans.Navigation.Contracts.INavigationModule;
                var work = services.GetService(typeof(WaroTrans.Fleet.Contracts.IRobotWorkQuery)) as WaroTrans.Fleet.Contracts.IRobotWorkQuery;

                // Validate the filters before touching the database: a typo must not look like "no history".
                var wantStates = true;
                var wantCommands = true;
                var wantTickets = true;
                if (!string.IsNullOrWhiteSpace(kind))
                {
                    switch (kind.Trim().ToUpperInvariant())
                    {
                        case "STATE":
                            wantCommands = false;
                            wantTickets = false;
                            break;
                        case "COMMAND":
                            wantStates = false;
                            wantTickets = false;
                            break;
                        case "TICKET":
                            wantStates = false;
                            wantCommands = false;
                            break;
                        default:
                            throw new DomainValidationException("kind must be STATE, COMMAND or TICKET.", "robot_history_kind_invalid");
                    }
                }

                RobotStateEventSource? onlySource = null;
                if (!string.IsNullOrWhiteSpace(source))
                {
                    var name = Enum.GetNames<RobotStateEventSource>()
                        .FirstOrDefault(n => string.Equals(n, source.Trim(), StringComparison.OrdinalIgnoreCase))
                        ?? throw new DomainValidationException(
                            $"source must be one of {string.Join(", ", Enum.GetNames<RobotStateEventSource>())}.", "robot_history_source_invalid");
                    onlySource = Enum.Parse<RobotStateEventSource>(name);
                    // Only a state change records where it came from; a command or a ticket has no source to match.
                    wantCommands = false;
                    wantTickets = false;
                }

                var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
                    ?? throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");

                var first = Math.Max(0, skip ?? 0);
                var size = Math.Clamp(take ?? 50, 1, MaxTake);
                var states = db.RobotStateEvents.AsNoTracking().Where(e => e.RobotId == id);
                var commands = db.RobotCommands.AsNoTracking().Where(c => c.RobotId == id);
                var tickets = db.TechnicalTickets.AsNoTracking().Where(t => t.RobotId == id);
                if (!wantStates) states = states.Where(_ => false);
                if (!wantCommands) commands = commands.Where(_ => false);
                if (!wantTickets) tickets = tickets.Where(_ => false);
                if (onlySource is { } wanted) states = states.Where(e => e.Source == wanted);
                if (from is { } start)
                {
                    states = states.Where(e => e.OccurredAt >= start);
                    commands = commands.Where(c => c.IssuedAt >= start);
                    tickets = tickets.Where(t => t.CreatedAt >= start);
                }

                if (to is { } end)
                {
                    states = states.Where(e => e.OccurredAt <= end);
                    commands = commands.Where(c => c.IssuedAt <= end);
                    tickets = tickets.Where(t => t.CreatedAt <= end);
                }

                var total = await states.CountAsync(cancellationToken) + await commands.CountAsync(cancellationToken)
                    + await tickets.CountAsync(cancellationToken);
                // Each list needs at most skip + take rows for the merged page to be right.
                var stateRows = await states.OrderByDescending(e => e.OccurredAt).Take(first + size).ToListAsync(cancellationToken);
                var commandRows = await commands.OrderByDescending(c => c.IssuedAt).Take(first + size)
                    .Select(c => new
                    {
                        c.Id,
                        c.IssuedAt,
                        Type = c.Type.ToString(),
                        Status = c.Status.ToString(),
                        c.Outcome,
                        c.JobStepId,
                        c.PayloadJson,
                        Error = c.RejectReasonCode ?? c.ErrorCode,
                        c.CompletedAt,
                        JobId = db.JobAssignments.Where(a => a.Id == c.JobAssignmentId).Select(a => (Guid?)a.JobId).FirstOrDefault()
                    })
                    .ToListAsync(cancellationToken);

                var ticketRows = await tickets.OrderByDescending(t => t.CreatedAt).Take(first + size).ToListAsync(cancellationToken);

                // Where MOVEs went: the endpoint at the goal (within its tolerance, 0.6 m at most), else the coordinates.
                IReadOnlyList<WaroTrans.Navigation.Contracts.EndpointPoseWithType> endpoints = [];
                if (navigation is not null && commandRows.Any(c => c.Type == nameof(RobotCommandType.NAVIGATE_TO_POSE)))
                {
                    try
                    {
                        endpoints = await navigation.GetEndpointsOnMapAsync(robot.CurrentMapVersionId, cancellationToken);
                    }
                    catch (Exception)
                    {
                        endpoints = [];
                    }
                }

                var jobIds = stateRows.Select(e => e.JobId).Concat(commandRows.Select(c => c.JobId)).Concat(ticketRows.Select(t => t.JobId))
                    .OfType<Guid>().Distinct().ToList();
                var jobNos = work is null ? new Dictionary<Guid, string>() : await work.GetJobNumbersAsync(jobIds, cancellationToken);
                string? JobNo(Guid? jobId) => jobId is { } j && jobNos.TryGetValue(j, out var no) ? no : null;

                var items = stateRows
                    .Select(e => new RobotHistoryItem(
                        "STATE", e.OccurredAt, e.FromStatus?.ToString(), e.ToStatus.ToString(), e.Reason, e.Source.ToString(), e.JobId, null, null, null, null, null,
                        e.Details?.RootElement.Clone(), JobNo(e.JobId)))
                    .Concat(commandRows.Select(c =>
                    {
                        var (target, note) = CommandFacts(c.Type, c.PayloadJson, endpoints);
                        return new RobotHistoryItem(
                            "COMMAND", c.IssuedAt, null, null, null, null, c.JobId, c.Id, c.Type, c.Status, c.Outcome, c.JobStepId, null,
                            JobNo(c.JobId), target, c.Error, note, c.CompletedAt);
                    }))
                    .Concat(ticketRows.Select(t => new RobotHistoryItem(
                        "TICKET", t.CreatedAt, null, null, null, null, t.JobId, null, null, t.Status, null, null, null,
                        JobNo(t.JobId), null, null, null, t.CompletedAt, t.Id, t.TicketNo, t.Type, t.Title, t.Result, t.CreatedByName)))
                    .OrderByDescending(i => i.OccurredAt)
                    .Skip(first)
                    .Take(size)
                    .ToList();
                return Results.Ok(new { items, total, skip = first, take = size });
            })
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotHistory")
            .WithSummary("State changes and commands of a robot, newest first")
            .WithDescription("Filters: `from`/`to` (time), `kind` = STATE, COMMAND or TICKET, `source` = SYSTEM, HEARTBEAT, DISPATCHER, OPERATOR or ROBOT (only state changes carry a source, so it leaves commands out). Page with `skip` and `take` (default 50, max 200); `total` counts everything the filters match.")
            .WithTags("Robots");

        group.MapGet("/robots/{id:guid}/commands/catalog", async (
                Guid id, FleetDbContext db, TimeProvider clock, Microsoft.Extensions.Options.IOptions<WaroTrans.BuildingBlocks.Options.MqttOptions> options, CancellationToken cancellationToken) =>
            {
                var robot = await db.Robots.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
                    ?? throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
                return Results.Ok(new { items = RobotControl.RobotCommandCatalog.For(robot, clock.GetUtcNow(), options.Value.CommandAckTimeoutSeconds) });
            })
            .RequirePermission(Permissions.RobotRead)
            .RequireRobotScope()
            .WithName("GetRobotCommandCatalog")
            .WithSummary("What this robot can be asked now; unsupported items are not to be offered")
            .WithTags("Robots");

        return group;
    }

    /// <summary>What a command was about, from its payload: the MOVE's target, the STOP's mode and reason, the system action.</summary>
    internal static (string? Target, string? Note) CommandFacts(
        string type, string? payloadJson, IReadOnlyList<WaroTrans.Navigation.Contracts.EndpointPoseWithType> endpoints)
    {
        if (string.IsNullOrWhiteSpace(payloadJson)) return (null, null);
        try
        {
            using var doc = JsonDocument.Parse(payloadJson);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return (null, null);
            string? Str(string name) =>
                root.EnumerateObject().FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)) is { Value.ValueKind: JsonValueKind.String } p
                    ? p.Value.GetString()
                    : null;
            double? Num(string name) =>
                root.EnumerateObject().FirstOrDefault(p => string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)) is { Value.ValueKind: JsonValueKind.Number } p
                    ? p.Value.GetDouble()
                    : null;
            switch (type)
            {
                case nameof(RobotCommandType.NAVIGATE_TO_POSE):
                case nameof(RobotCommandType.LOCALIZE):
                    if (Str("endpointCode") is { Length: > 0 } code) return (code, null);
                    if (Num("x") is not { } x || Num("y") is not { } y) return (null, null);
                    var nearest = endpoints
                        .Select(e => (e, d: Math.Sqrt((e.X - x) * (e.X - x) + (e.Y - y) * (e.Y - y))))
                        .OrderBy(t => t.d)
                        .FirstOrDefault();
                    return nearest.e is not null && nearest.d <= Math.Min(0.6, Math.Max(0.15, nearest.e.PositionTolerance * 3))
                        ? (nearest.e.Code, null)
                        : (string.Create(System.Globalization.CultureInfo.InvariantCulture, $"x {x:0.00}, y {y:0.00}"), null);
                case nameof(RobotCommandType.STOP):
                    return (Str("mode"), Str("reason"));
                case nameof(RobotCommandType.SYSTEM_ACTION):
                    return (Str("action"), null);
                default:
                    return (null, null);
            }
        }
        catch (JsonException)
        {
            return (null, null);
        }
    }
}
