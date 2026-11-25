using System.Collections.Concurrent;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using WaroTrans.BuildingBlocks.Abstractions;
using WaroTrans.BuildingBlocks.Exceptions;
using WaroTrans.BuildingBlocks.Mqtt;
using WaroTrans.Fleet.IntegrationEvents;
using WaroTrans.Fleet.Persistence;
using WaroTrans.Fleet.Traffic;

namespace WaroTrans.Fleet.Features.Lab;

public sealed record LabInjectRequest(
    string ScenarioId,
    string? RobotCode,
    Guid? TransportRequestId,
    int? TtlSeconds,
    Dictionary<string, string>? Parameters);

public sealed record LabInjectionView(
    Guid Id,
    string ScenarioId,
    string Title,
    string Executor,
    string? RobotCode,
    Guid? TransportRequestId,
    IReadOnlyDictionary<string, string> Parameters,
    DateTimeOffset InjectedAt,
    DateTimeOffset ExpiresAt,
    string Status,
    DateTimeOffset? ClearedAt,
    string? Detail,
    string? InjectedBy);

/// <summary>
/// Injects and clears lab faults. Kept in memory (a Host restart forgets them; every robot-side fault ends by itself
/// after its TTL, and the journal keeps the record). Never active unless Lab:Enabled.
/// </summary>
public sealed class LabInjectionService(
    IServiceScopeFactory scopes,
    IMqttLabPublisher mqtt,
    IIntegrationEventPublisher events,
    IOptions<LabOptions> options,
    TimeProvider clock,
    ILogger<LabInjectionService> logger,
    ISegmentedTrafficCoordinator? traffic = null)
{
    public const int MaxTtlSeconds = 900;
    private readonly ConcurrentDictionary<Guid, LabInjectionView> _injections = new();

    public IReadOnlyList<LabInjectionView> List() =>
        _injections.Values.OrderByDescending(i => i.InjectedAt).ToList();

    public async Task<LabInjectionView> InjectAsync(LabInjectRequest request, string? user, CancellationToken ct)
    {
        EnsureEnabled();
        var scenario = LabCatalog.Find(request.ScenarioId)
                       ?? throw new DomainValidationException($"Unknown lab scenario '{request.ScenarioId}'.", "lab_scenario_unknown");
        var ttl = request.TtlSeconds ?? scenario.DefaultTtlSeconds;
        if (ttl is < 1 or > MaxTtlSeconds)
        {
            throw new DomainValidationException($"ttlSeconds must be 1..{MaxTtlSeconds}.", "lab_ttl_invalid");
        }

        var parameters = new Dictionary<string, string>(scenario.DefaultParameters, StringComparer.Ordinal);
        foreach (var (k, v) in request.Parameters ?? [])
        {
            parameters[k] = v;
        }

        Guid? robotId = null;
        string? robotCode = null;
        if (!string.IsNullOrWhiteSpace(request.RobotCode))
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            var robot = await db.Robots.AsNoTracking().Where(r => r.Code == request.RobotCode)
                            .Select(r => new { r.Id, r.Code }).FirstOrDefaultAsync(ct)
                        ?? throw new NotFoundException($"Robot '{request.RobotCode}' was not found.", "robot_not_found");
            (robotId, robotCode) = (robot.Id, robot.Code);
        }
        else if (scenario.Executor == LabExecutors.Robot)
        {
            throw new DomainValidationException("This fault runs on a robot: robotCode is required.", "lab_robot_required");
        }

        var now = clock.GetUtcNow();
        var view = new LabInjectionView(Guid.NewGuid(), scenario.Id, scenario.Title, scenario.Executor, robotCode,
            request.TransportRequestId, parameters, now, now.AddSeconds(ttl), "ACTIVE", null, null, user);

        switch (scenario.Executor)
        {
            case LabExecutors.Robot:
                await mqtt.PublishLabAsync(robotCode!, new
                {
                    schemaVersion = 1,
                    action = "inject",
                    injectionId = view.Id,
                    scenarioId = scenario.Id,
                    ttlSeconds = ttl,
                    parameters,
                    sentAt = now
                }, ct);
                break;
            case LabExecutors.Host:
                await ApplyHostAsync(scenario.Id, parameters, hold: true, ct);
                break;
        }

        _injections[view.Id] = view;
        logger.LogWarning("LAB fault {Scenario} injected on {Robot} (request {Request}) for {Ttl} s by {User}",
            scenario.Id, robotCode ?? "-", request.TransportRequestId, ttl, user ?? "?");
        await events.PublishAsync(new LabFaultInjected(view.Id, scenario.Id, scenario.Title, scenario.Executor, robotId,
            robotCode, request.TransportRequestId, ttl, parameters, user), ct);
        return view;
    }

    public async Task<LabInjectionView> StopAsync(Guid id, string outcome, CancellationToken ct)
    {
        EnsureEnabled();
        if (!_injections.TryGetValue(id, out var view))
        {
            throw new NotFoundException($"Lab injection '{id}' was not found.", "lab_injection_not_found");
        }

        if (view.Status != "ACTIVE")
        {
            return view;
        }

        string? detail = null;
        try
        {
            switch (view.Executor)
            {
                case LabExecutors.Robot:
                    await mqtt.PublishLabAsync(view.RobotCode!, new
                    {
                        schemaVersion = 1,
                        action = "clear",
                        injectionId = view.Id,
                        scenarioId = view.ScenarioId,
                        sentAt = clock.GetUtcNow()
                    }, ct);
                    break;
                case LabExecutors.Host:
                    await ApplyHostAsync(view.ScenarioId, view.Parameters, hold: false, ct);
                    break;
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            detail = ex.Message;
            outcome = "FAILED";
        }

        var cleared = view with { Status = outcome, ClearedAt = clock.GetUtcNow(), Detail = detail };
        _injections[id] = cleared;
        Guid? robotId = null;
        if (view.RobotCode is not null)
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<FleetDbContext>();
            robotId = await db.Robots.AsNoTracking().Where(r => r.Code == view.RobotCode).Select(r => (Guid?)r.Id)
                .FirstOrDefaultAsync(ct);
        }

        await events.PublishAsync(new LabFaultCleared(id, view.ScenarioId, robotId, view.RobotCode, view.TransportRequestId,
            outcome, detail), ct);
        return cleared;
    }

    /// <summary>Ends every fault whose TTL has passed (the robot ends its own; this records it and undoes host faults).</summary>
    public async Task ExpireAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        foreach (var view in _injections.Values.Where(v => v.Status == "ACTIVE" && v.ExpiresAt <= now).ToList())
        {
            await StopAsync(view.Id, "EXPIRED", ct);
        }
    }

    private async Task ApplyHostAsync(string scenarioId, IReadOnlyDictionary<string, string> p, bool hold, CancellationToken ct)
    {
        if (scenarioId != "TRA-01")
        {
            return;
        }

        if (traffic is null)
        {
            throw new DomainValidationException("Traffic is not running.", "lab_traffic_unavailable");
        }

        static double Num(IReadOnlyDictionary<string, string> p, string k) =>
            p.TryGetValue(k, out var v) && double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var d)
                ? d
                : throw new DomainValidationException($"Parameter '{k}' must be a number (map metres).", "lab_parameter_invalid");

        var r = Num(p, "r");
        if (r is <= 0 or > 1.5)
        {
            throw new DomainValidationException("r must be 0..1.5 m.", "lab_parameter_invalid");
        }

        var result = await traffic.LabPhantomHoldAsync(Num(p, "x"), Num(p, "y"), r, hold, ct);
        if (!result.Ok)
        {
            throw new DomainValidationException($"Traffic refused the phantom: {result.Reason}", "lab_traffic_refused");
        }
    }

    private void EnsureEnabled()
    {
        if (!options.Value.Enabled)
        {
            throw new NotFoundException("The Fault Injection Lab is disabled.", "lab_disabled");
        }
    }
}
