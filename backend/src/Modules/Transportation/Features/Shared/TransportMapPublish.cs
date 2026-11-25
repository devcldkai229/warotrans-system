using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.Navigation.Contracts;
using WaroTrans.Transportation.Entities;
using WaroTrans.Transportation.Enums;
using WaroTrans.Transportation.Persistence;
using WaroTrans.WorkflowExecution.Contracts;

namespace WaroTrans.Transportation.Features.Shared;

/// <summary>
/// The request side of publishing a map. A request that has not started (SUBMITTED, or QUEUED with no Job started)
/// moves to the new map with its pickup and drop-off Endpoints taken by code; one whose Endpoints the new map lacks
/// blocks the publish. Requests already running are the Jobs' concern (running Jobs block the publish).
/// </summary>
public sealed class TransportMapPublish(
    TransportationDbContext db,
    INavigationModule navigation,
    ILogger<TransportMapPublish> logger,
    ITransportRequestJobControl? jobs = null) : IMapPublishGuard, IMapPublishFollower
{
    public async Task<IReadOnlyList<MapPublishIssue>> CheckAsync(MapPublishContext context, CancellationToken cancellationToken = default)
    {
        var plan = await PlanAsync(context, tracked: false, cancellationToken);
        var issues = new List<MapPublishIssue>();
        if (plan.Movable.Count > 0)
        {
            issues.Add(new MapPublishIssue(MapPublishSeverity.Info, "requests_move_to_new_map",
                $"{plan.Movable.Count} request(s) not started yet ({Sample(plan.Movable.Select(m => m.Request.RequestCode))}) will use {context.NewMapCode}.",
                string.Join(", ", plan.Movable.Select(m => m.Request.RequestCode)),
                Args: new Dictionary<string, string>
                {
                    ["count"] = plan.Movable.Count.ToString(), ["requests"] = Sample(plan.Movable.Select(m => m.Request.RequestCode)),
                    ["map"] = context.NewMapCode
                }));
        }

        foreach (var (request, missing) in plan.Stuck)
        {
            issues.Add(new MapPublishIssue(MapPublishSeverity.Block, "request_place_missing",
                $"Request {request.RequestCode} uses {string.Join(", ", missing)}, which {context.NewMapCode} does not have. Add them (same name), or cancel or reject the request.",
                request.RequestCode,
                Args: new Dictionary<string, string>
                {
                    ["request"] = request.RequestCode, ["places"] = string.Join(", ", missing), ["map"] = context.NewMapCode
                }));
        }

        return issues;
    }

    public async Task OnPublishedAsync(MapPublishContext context, CancellationToken cancellationToken = default)
    {
        var plan = await PlanAsync(context, tracked: true, cancellationToken);
        if (plan.Movable.Count == 0) return;
        var now = DateTimeOffset.UtcNow;
        foreach (var (request, endpoints) in plan.Movable)
        {
            request.MapVersionId = context.NewMapVersionId;
            request.UpdatedAt = now;
            foreach (var detail in request.Details)
            {
                detail.SourceEndpointId = endpoints[detail.SourceEndpointId];
                detail.DestinationEndpointId = endpoints[detail.DestinationEndpointId];
                detail.UpdatedAt = now;
            }
        }

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Map {MapCode} published: {Count} request(s) moved to it ({Requests})",
            context.NewMapCode, plan.Movable.Count, Sample(plan.Movable.Select(m => m.Request.RequestCode)));
    }

    private sealed record Plan(
        List<(TransportRequest Request, Dictionary<Guid, Guid> Endpoints)> Movable,
        List<(TransportRequest Request, List<string> Missing)> Stuck);

    private async Task<Plan> PlanAsync(MapPublishContext context, bool tracked, CancellationToken cancellationToken)
    {
        var plan = new Plan([], []);
        var old = context.ReplacedMapVersionIds;
        if (old.Count == 0) return plan;
        var query = db.TransportRequests.Include(r => r.Details)
            .Where(r => r.WarehouseId == context.WarehouseId && old.Contains(r.MapVersionId)
                        && (r.Status == TransportRequestStatus.SUBMITTED || r.Status == TransportRequestStatus.QUEUED));
        var requests = await (tracked ? query : query.AsNoTracking()).ToListAsync(cancellationToken);
        if (requests.Count == 0) return plan;

        // A QUEUED request whose Jobs already started is running: not moved (running Jobs block the publish anyway).
        var jobStates = jobs is null
            ? new Dictionary<Guid, IReadOnlyList<RequestJobState>>()
            : await jobs.GetJobsAsync(requests.Select(r => r.Id).ToList(), cancellationToken);
        var waiting = requests
            .Where(r => !jobStates.TryGetValue(r.Id, out var states) || states.All(s => s.NotStarted || s.Terminal))
            .ToList();

        var ids = waiting.SelectMany(r => r.Details.SelectMany(d => new[] { d.SourceEndpointId, d.DestinationEndpointId })).Distinct().ToList();
        var resolved = (await navigation.ResolvePlacesOnMapAsync(ids, context.NewMapVersionId, cancellationToken))
            .ToDictionary(r => r.SourceId);
        foreach (var request in waiting)
        {
            var endpoints = new Dictionary<Guid, Guid>();
            var missing = new List<string>();
            foreach (var id in request.Details.SelectMany(d => new[] { d.SourceEndpointId, d.DestinationEndpointId }).Distinct())
            {
                if (resolved.TryGetValue(id, out var on) && on.TargetId is { } target)
                {
                    endpoints[id] = target;
                }
                else
                {
                    missing.Add(on?.Code ?? id.ToString());
                }
            }

            if (missing.Count == 0) plan.Movable.Add((request, endpoints));
            else plan.Stuck.Add((request, missing));
        }

        return plan;
    }

    private static string Sample(IEnumerable<string> items)
    {
        var list = items.ToList();
        return list.Count <= 5 ? string.Join(", ", list) : string.Join(", ", list.Take(5)) + $" +{list.Count - 5}";
    }
}
