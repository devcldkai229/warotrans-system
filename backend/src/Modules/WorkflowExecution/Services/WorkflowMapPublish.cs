using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using WaroTrans.BuildingBlocks.Enums;
using WaroTrans.Navigation.Contracts;
using WaroTrans.WorkflowExecution.Entities;
using WaroTrans.WorkflowExecution.Enums;
using WaroTrans.WorkflowExecution.Persistence;
using WaroTrans.WorkflowExecution.ValueObjects;

namespace WaroTrans.WorkflowExecution.Services;

/// <summary>
/// A place (Endpoint or EndpointGroup id) a workflow names, and where in the workflow. Hint: an Admin setting no step
/// drives to (a parking / charger group robot care prefers, falling back to any free endpoint of that type), so a map
/// without it changes the choice but breaks nothing.
/// </summary>
public sealed record WorkflowPlaceRef(Guid PlaceId, string Where, bool Hint = false);

public static class WorkflowPlaces
{
    /// <summary>
    /// Every place a workflow names itself (not what a request brings): Admin settings that pick an Endpoint or group
    /// (WAYPOINT / WAYPOINT_GROUP, or a UUID setting named *EndpointId) and constant step inputs named *EndpointId.
    /// </summary>
    public static IReadOnlyList<WorkflowPlaceRef> Collect(Workflow workflow)
    {
        var refs = new List<WorkflowPlaceRef>();
        var boundToSteps = workflow.Tasks.SelectMany(t => t.Steps)
            .SelectMany(s => s.InputBindings.Values)
            .Where(b => b.SourceType == BindingSourceType.WORKFLOW_VAR && b.SourceReference is not null)
            .Select(b => b.SourceReference!)
            .ToHashSet(StringComparer.Ordinal);
        foreach (var variable in workflow.VariablesSchema)
        {
            if (variable.Source != WorkflowVariableSource.ADMIN_INPUT || variable.DataType != WorkflowDataType.UUID) continue;
            var isPlace = variable.Format is WorkflowVariableDefinition.WaypointFormat or WorkflowVariableDefinition.WaypointGroupFormat
                          || IsPlaceKey(variable.Key);
            if (isPlace && AsGuid(variable.ConfiguredValue) is { } id)
            {
                var hint = variable.Format == WorkflowVariableDefinition.WaypointGroupFormat && !boundToSteps.Contains(variable.Key);
                refs.Add(new WorkflowPlaceRef(id, string.IsNullOrWhiteSpace(variable.Name) ? variable.Key : variable.Name, hint));
            }
        }

        foreach (var step in workflow.Tasks.SelectMany(t => t.Steps).OrderBy(s => s.SequenceNo))
        {
            foreach (var (key, binding) in step.InputBindings)
            {
                if (binding.SourceType == BindingSourceType.CONSTANT && IsPlaceKey(key) && AsGuid(binding.ConstantValue) is { } id)
                {
                    refs.Add(new WorkflowPlaceRef(id, $"{step.Name} · {key}"));
                }
            }
        }

        return refs;
    }

    private static bool IsPlaceKey(string key) =>
        key.EndsWith("EndpointId", StringComparison.OrdinalIgnoreCase) || key.EndsWith("EndpointGroupId", StringComparison.OrdinalIgnoreCase);

    private static Guid? AsGuid(JsonElement? value) =>
        value is { ValueKind: JsonValueKind.String } text && Guid.TryParse(text.GetString(), out var id) ? id : null;
}

/// <summary>
/// The workflow side of publishing a map (like OTTO's publish warnings): a published workflow that names a place the new
/// map lacks (by code) blocks it; a Job still running on the old map blocks it for good (it would lose its map midway);
/// Jobs not started yet move to the new map once it is published.
/// </summary>
public sealed class WorkflowMapPublish(
    WorkflowExecutionDbContext db,
    INavigationModule navigation,
    ILogger<WorkflowMapPublish> logger) : IMapPublishGuard, IMapPublishFollower
{
    public static readonly JobStatus[] Running =
        [JobStatus.ASSIGNED, JobStatus.RUNNING, JobStatus.PAUSED, JobStatus.REASSIGNING, JobStatus.RECOVERY_REQUIRED];

    public static readonly JobStatus[] NotStarted = [JobStatus.CREATED, JobStatus.QUEUED];

    public async Task<IReadOnlyList<MapPublishIssue>> CheckAsync(MapPublishContext context, CancellationToken cancellationToken = default)
    {
        var issues = new List<MapPublishIssue>();
        var old = context.ReplacedMapVersionIds;

        if (old.Count > 0)
        {
            var running = await db.Jobs.AsNoTracking()
                .Where(j => old.Contains(j.MapVersionId) && Running.Contains(j.Status))
                .Select(j => j.JobNo)
                .ToListAsync(cancellationToken);
            if (running.Count > 0)
            {
                issues.Add(new MapPublishIssue(MapPublishSeverity.Block, "jobs_running",
                    $"{running.Count} Job(s) are running on the current map ({Sample(running)}). Let them finish (or cancel them) first.",
                    string.Join(", ", running), Overridable: false,
                    Args: new Dictionary<string, string> { ["count"] = running.Count.ToString(), ["jobs"] = Sample(running) }));
            }

            var waiting = await db.Jobs.AsNoTracking()
                .Where(j => old.Contains(j.MapVersionId) && NotStarted.Contains(j.Status))
                .Select(j => j.JobNo)
                .ToListAsync(cancellationToken);
            if (waiting.Count > 0)
            {
                issues.Add(new MapPublishIssue(MapPublishSeverity.Info, "jobs_move_to_new_map",
                    $"{waiting.Count} Job(s) not started yet ({Sample(waiting)}) will run on {context.NewMapCode}.",
                    string.Join(", ", waiting),
                    Args: new Dictionary<string, string> { ["count"] = waiting.Count.ToString(), ["jobs"] = Sample(waiting), ["map"] = context.NewMapCode }));
            }
        }

        var workflows = await db.Workflows.AsNoTracking()
            .Include(w => w.Tasks).ThenInclude(t => t.Steps)
            .Where(w => w.Status == WorkflowStatus.PUBLISHED)
            .ToListAsync(cancellationToken);
        var refs = workflows.Select(w => (Workflow: w, Places: WorkflowPlaces.Collect(w))).Where(x => x.Places.Count > 0).ToList();
        var ids = refs.SelectMany(x => x.Places.Select(p => p.PlaceId)).Distinct().ToList();
        var resolved = (await navigation.ResolvePlacesOnMapAsync(ids, context.NewMapVersionId, cancellationToken))
            .ToDictionary(r => r.SourceId);

        foreach (var (workflow, places) in refs)
        {
            foreach (var place in places)
            {
                if (!resolved.TryGetValue(place.PlaceId, out var on))
                {
                    issues.Add(new MapPublishIssue(MapPublishSeverity.Warn, "workflow_place_unknown",
                        $"Workflow {workflow.Code} v{workflow.VersionNo} ({place.Where}) names a place that no longer exists on any map.",
                        workflow.Code,
                        Args: new Dictionary<string, string> { ["workflow"] = workflow.Code, ["version"] = workflow.VersionNo.ToString(), ["where"] = place.Where }));
                }
                else if (!on.Found && place.Hint)
                {
                    issues.Add(new MapPublishIssue(MapPublishSeverity.Warn, "workflow_group_missing",
                        $"Workflow {workflow.Code} v{workflow.VersionNo} ({place.Where}) prefers group {on.Code}, which {context.NewMapCode} does not have: robots will use any free endpoint of that type.",
                        workflow.Code,
                        Args: new Dictionary<string, string>
                        {
                            ["workflow"] = workflow.Code, ["version"] = workflow.VersionNo.ToString(), ["where"] = place.Where,
                            ["place"] = on.Code ?? "", ["map"] = context.NewMapCode
                        }));
                }
                else if (!on.Found)
                {
                    issues.Add(new MapPublishIssue(MapPublishSeverity.Block, "workflow_place_missing",
                        $"Workflow {workflow.Code} v{workflow.VersionNo} ({place.Where}) needs {on.Code}, which {context.NewMapCode} does not have. Add it (same name) or change the workflow.",
                        workflow.Code,
                        Args: new Dictionary<string, string>
                        {
                            ["workflow"] = workflow.Code, ["version"] = workflow.VersionNo.ToString(), ["where"] = place.Where,
                            ["place"] = on.Code ?? "", ["map"] = context.NewMapCode
                        }));
                }
            }
        }

        return issues;
    }

    public async Task OnPublishedAsync(MapPublishContext context, CancellationToken cancellationToken = default)
    {
        if (context.ReplacedMapVersionIds.Count == 0) return;
        var old = context.ReplacedMapVersionIds;
        var jobs = await db.Jobs
            .Where(j => old.Contains(j.MapVersionId) && NotStarted.Contains(j.Status))
            .ToListAsync(cancellationToken);
        if (jobs.Count == 0) return;
        foreach (var job in jobs)
        {
            // The places it names (its workflow, its request) are resolved on the Job's map by code when each step runs.
            job.MapVersionId = context.NewMapVersionId;
        }

        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Map {MapCode} published: {Count} Job(s) not started yet moved to it ({Jobs})",
            context.NewMapCode, jobs.Count, Sample(jobs.Select(j => j.JobNo).ToList()));
    }

    private static string Sample(IReadOnlyList<string> items) =>
        items.Count <= 5 ? string.Join(", ", items) : string.Join(", ", items.Take(5)) + $" +{items.Count - 5}";
}
