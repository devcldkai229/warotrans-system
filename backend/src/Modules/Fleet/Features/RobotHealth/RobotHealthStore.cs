using System.Collections.Concurrent;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using WaroTrans.BuildingBlocks.Authorization;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt.Messages;
using WaroTrans.Fleet.Abstractions;
using WaroTrans.Fleet.Persistence;

namespace WaroTrans.Fleet.Features.RobotHealth;

/// <summary>
/// Latest diagnostics snapshot per robot (RB-10), in memory: it is a live view, history is not needed and a
/// restart simply shows UNKNOWN until the next snapshot (a few seconds).
/// </summary>
public sealed class RobotHealthStore(TimeProvider clock)
{
    /// <summary>Older than this, every value is shown STALE: the robot stopped reporting.</summary>
    public static readonly TimeSpan StaleAfter = TimeSpan.FromSeconds(15);

    private readonly ConcurrentDictionary<string, (DateTimeOffset ReceivedAt, RobotHealthMessage Message)> _latest =
        new(StringComparer.Ordinal);

    public void Put(RobotHealthMessage message) => _latest[message.RobotCode] = (clock.GetUtcNow(), message);

    public RobotHealthResponse Get(Guid robotId, string robotCode)
    {
        if (!_latest.TryGetValue(robotCode, out var entry))
        {
            return new RobotHealthResponse(robotId, robotCode, RobotHealthItem.Unknown, null, false, []);
        }

        var stale = clock.GetUtcNow() - entry.ReceivedAt > StaleAfter;
        var items = entry.Message.Items
            .Select(i => new RobotHealthItemDto(
                i.Name, stale ? RobotHealthItem.Stale : Normalize(i.Level), i.Value, i.Unit, i.Message, i.MeasuredAt))
            .ToList();
        return new RobotHealthResponse(
            robotId, robotCode, stale ? RobotHealthItem.Stale : Overall(items), entry.ReceivedAt, stale, items);
    }

    /// <summary>
    /// Worst measured level wins: ERROR, then STALE, then WARN, then OK. Something the robot cannot measure (UNKNOWN,
    /// e.g. no thermal sensor) does not make the whole robot unknown; only when nothing at all was measured.
    /// </summary>
    public static string Overall(IReadOnlyCollection<RobotHealthItemDto> items)
    {
        string[] order = [RobotHealthItem.Error, RobotHealthItem.Stale, RobotHealthItem.Warn, RobotHealthItem.Ok];
        return order.FirstOrDefault(level => items.Any(i => i.Level == level)) ?? RobotHealthItem.Unknown;
    }

    private static string Normalize(string? level) => level switch
    {
        RobotHealthItem.Ok or RobotHealthItem.Warn or RobotHealthItem.Error or RobotHealthItem.Stale => level,
        _ => RobotHealthItem.Unknown
    };
}

public sealed record RobotHealthItemDto(
    string Name,
    string Level,
    double? Value,
    string? Unit,
    string? Message,
    DateTimeOffset? MeasuredAt);

public sealed record RobotHealthResponse(
    Guid RobotId,
    string RobotCode,
    string Overall,
    DateTimeOffset? ReceivedAt,
    bool Stale,
    IReadOnlyList<RobotHealthItemDto> Items);

public sealed class ProcessRobotHealthHandler(
    FleetDbContext db,
    RobotHealthStore store,
    IRobotRealtimeNotifier realtime)
{
    public async Task HandleAsync(RobotHealthMessage message, CancellationToken cancellationToken)
    {
        var robot = await db.Robots.AsNoTracking()
            .Where(r => r.Code == message.RobotCode)
            .Select(r => new { r.Id, r.Code })
            .FirstOrDefaultAsync(cancellationToken);
        if (robot is null)
        {
            return; // unknown robot: nothing to show it on
        }

        store.Put(message);
        await realtime.NotifyHealthUpdatedAsync(robot.Id, robot.Code, store.Get(robot.Id, robot.Code).Overall, cancellationToken);
    }
}

public static class RobotHealthEndpoint
{
    public static RouteGroupBuilder MapRobotHealth(this RouteGroupBuilder group)
    {
        group.MapGet("/robots/{id:guid}/health", async (Guid id, FleetDbContext db, RobotHealthStore store, CancellationToken ct) =>
            {
                var robot = await db.Robots.AsNoTracking().Where(r => r.Id == id).Select(r => new { r.Id, r.Code })
                                .FirstOrDefaultAsync(ct)
                            ?? throw new NotFoundException($"Robot '{id}' was not found.", "robot_not_found");
                return Results.Ok(store.Get(robot.Id, robot.Code));
            })
            .RequirePermission(Permissions.RobotDiagnostics)
            .RequireRobotScope()
            .WithName("GetRobotHealth")
            .WithDescription("Latest diagnostics of the robot. STALE when the robot stopped reporting for 15 s; UNKNOWN for anything not measured.");
        return group;
    }
}
