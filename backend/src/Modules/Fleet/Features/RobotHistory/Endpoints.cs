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
    JsonElement? Details);

/// <summary>BOTH-02: what a robot went through, newest first. No heartbeat noise, because none is written.</summary>
public static class RobotHistoryEndpoints
{
    public const int MaxTake = 200;

    public static RouteGroupBuilder MapRobotHistory(this RouteGroupBuilder group)
    {
        group.MapGet("/robots/{id:guid}/state-history", async (
                Guid id, DateTimeOffset? from, DateTimeOffset? to, string? kind, string? source, int? skip, int? take,
                FleetDbContext db, CancellationToken cancellationToken) =>
            {
                // Validate the filters before touching the database: a typo must not look like "no history".
                var wantStates = true;
                var wantCommands = true;
                if (!string.IsNullOrWhiteSpace(kind))
                {
                    switch (kind.Trim().ToUpperInvariant())
                    {
                        case "STATE":
                            wantCommands = false;
                            break;
                        case "COMMAND":
                            wantStates = false;
                            break;
                        default:
                            throw new DomainValidationException("kind must be STATE or COMMAND.", "robot_history_kind_invalid");
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
                    // Only a state change records where it came from; a command has no source to match.
                    wantCommands = false;
                }

                if (!await db.Robots.AsNoTracking().AnyAsync(r => r.Id == id, cancellationToken))
                {
                    throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
                }

                var first = Math.Max(0, skip ?? 0);
                var size = Math.Clamp(take ?? 50, 1, MaxTake);
                var states = db.RobotStateEvents.AsNoTracking().Where(e => e.RobotId == id);
                var commands = db.RobotCommands.AsNoTracking().Where(c => c.RobotId == id);
                if (!wantStates) states = states.Where(_ => false);
                if (!wantCommands) commands = commands.Where(_ => false);
                if (onlySource is { } wanted) states = states.Where(e => e.Source == wanted);
                if (from is { } start)
                {
                    states = states.Where(e => e.OccurredAt >= start);
                    commands = commands.Where(c => c.IssuedAt >= start);
                }

                if (to is { } end)
                {
                    states = states.Where(e => e.OccurredAt <= end);
                    commands = commands.Where(c => c.IssuedAt <= end);
                }

                var total = await states.CountAsync(cancellationToken) + await commands.CountAsync(cancellationToken);
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
                        JobId = db.JobAssignments.Where(a => a.Id == c.JobAssignmentId).Select(a => (Guid?)a.JobId).FirstOrDefault()
                    })
                    .ToListAsync(cancellationToken);

                var items = stateRows
                    .Select(e => new RobotHistoryItem(
                        "STATE", e.OccurredAt, e.FromStatus?.ToString(), e.ToStatus.ToString(), e.Reason, e.Source.ToString(), e.JobId, null, null, null, null, null, e.Details?.RootElement.Clone()))
                    .Concat(commandRows.Select(c => new RobotHistoryItem(
                        "COMMAND", c.IssuedAt, null, null, null, null, c.JobId, c.Id, c.Type, c.Status, c.Outcome, c.JobStepId, null)))
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
            .WithDescription("Filters: `from`/`to` (time), `kind` = STATE or COMMAND, `source` = SYSTEM, HEARTBEAT, DISPATCHER, OPERATOR or ROBOT (only state changes carry a source, so it leaves commands out). Page with `skip` and `take` (default 50, max 200); `total` counts everything the filters match.")
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
}
